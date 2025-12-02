export async function onRequestGet({ request, env }) {
  const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/auth';

  const url = new URL(request.url);
  const post = url.searchParams.get('post') || 'https://virtual-machine.pages.dev';

  const state = crypto.randomUUID();
  const payload = JSON.stringify({ s: state, t: Date.now(), returnTo: post });
  const encodedPayload = btoa(payload);

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(env.COOKIE_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(encodedPayload));
  const signed = `${encodedPayload}.${btoa(String.fromCharCode(...new Uint8Array(sig)))}`;

  const authUrl = new URL(GOOGLE_AUTH_URL);
  authUrl.searchParams.set('client_id', env.CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', env.REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid email profile https://www.googleapis.com/auth/drive.file');
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('state', state);

  return new Response(null, {
    status: 302,
    headers: {
      Location: authUrl.toString(),
      'Set-Cookie': `oauth_state=${encodeURIComponent(signed)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=300; Domain=virtual-machine.pages.dev`
    }
  });
}
