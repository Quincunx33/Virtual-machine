export async function onRequestGet({ request, env }) {
  const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

  const url = new URL(request.url);
  const post = url.searchParams.get('post') || '/';

  const state = crypto.randomUUID();
  const signed = await signState(
    JSON.stringify({ s: state, t: Date.now(), returnTo: post }),
    env.COOKIE_SECRET
  );

  const authUrl = new URL(GOOGLE_AUTH_URL);
  authUrl.searchParams.set('client_id', env.CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', env.REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid email profile');
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('state', state);

  return new Response(null, {
    status: 302,
    headers: {
      Location: authUrl.toString(),
      "Set-Cookie": makeCookie("oauth_state", signed, {
        httpOnly: true, secure: true, sameSite: "Lax",
        path: "/auth", maxAge: 300
      })
    }
  });
}

// Shared utils:
async function signState(state, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(state));
  return `${state}.${b64(sig)}`;
}
function b64(a) { return btoa(String.fromCharCode(...new Uint8Array(a))).replace(/=*$/, ""); }
function makeCookie(n, v, o = {}) {
  return [
    `${n}=${v}`,
    o.maxAge && `Max-Age=${o.maxAge}`,
    o.httpOnly && "HttpOnly",
    o.secure && "Secure",
    o.sameSite && `SameSite=${o.sameSite}`,
    o.path && `Path=${o.path}`,
  ].filter(Boolean).join("; ");
}
