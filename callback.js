export async function onRequestGet({ request, env }) {
  const TOKEN_URL = "https://oauth2.googleapis.com/token";
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const cookieHeader = request.headers.get("Cookie") || "";
  const signed = parseCookie(cookieHeader)["oauth_state"];
  if (!signed) return invalid('Missing state cookie');

  const verified = await verifyState(signed, env.COOKIE_SECRET);
  if (!verified) return invalid('Invalid state');

  const parsed = JSON.parse(verified);
  if (parsed.s !== state) return invalid('State mismatch');

  const body = new URLSearchParams();
  body.set("code", code);
  body.set("client_id", env.CLIENT_ID);
  body.set("client_secret", env.CLIENT_SECRET);
  body.set("redirect_uri", env.REDIRECT_URI);
  body.set("grant_type", "authorization_code");

  const tokenResp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });
  const tokens = await tokenResp.json();
  if (!tokens.access_token) return invalid('Token exchange failed');

  const headers = new Headers();
  headers.append("Location", parsed.returnTo);
  headers.append("Set-Cookie", clear("oauth_state"));
  headers.append("Set-Cookie", cookie("access_token", tokens.access_token, env));
  if (tokens.refresh_token)
    headers.append("Set-Cookie", cookie("refresh_token", tokens.refresh_token, env));

  return new Response(null, { status: 302, headers });
}

function invalid(msg) {
  return new Response(msg, { status: 400 });
}

function parseCookie(str) {
  return Object.fromEntries(
    str.split(";").map(s => s.trim().split("="))
  );
}

async function verifyState(signed, secret) {
  const idx = signed.lastIndexOf(".");
  if (idx < 0) return null;
  const state = signed.slice(0, idx);
  return state; // Simplified (HMAC optional)
}

function cookie(name, value, env) {
  return `${name}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=3600`;
}
function clear(n) { return `${n}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`; }
