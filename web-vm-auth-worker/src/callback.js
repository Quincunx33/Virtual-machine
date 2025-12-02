export async function onRequestGet({ request, env }) {
  const TOKEN_URL = 'https://oauth2.googleapis.com/token';
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (!code || !state) {
    return new Response('Missing code or state parameter', { status: 400 });
  }

  const cookieHeader = request.headers.get('Cookie') || '';
  const cookies = {};
  cookieHeader.split(';').forEach(cookie => {
    const [key, ...valueParts] = cookie.trim().split('=');
    const value = valueParts.join('=');
    if (key && value) {
      cookies[key.trim()] = decodeURIComponent(value.trim());
    }
  });

  const signed = cookies['oauth_state'];
  
  if (!signed) {
    return new Response('Missing state cookie', { status: 400 });
  }

  try {
    const [payload, sigB64] = signed.split('.');
    if (!payload || !sigB64) {
      return new Response('Invalid state format', { status: 400 });
    }

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(env.COOKIE_SECRET),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );

    const sig = Uint8Array.from(atob(sigB64), c => c.charCodeAt(0));
    const data = encoder.encode(payload);
    const valid = await crypto.subtle.verify('HMAC', key, sig, data);
    
    if (!valid) {
      return new Response('Invalid state signature', { status: 400 });
    }
    
    const parsed = JSON.parse(atob(payload));
    if (parsed.s !== state) {
      return new Response('State mismatch', { status: 400 });
    }

    // Exchange code for tokens
    const body = new URLSearchParams();
    body.set('code', code);
    body.set('client_id', env.CLIENT_ID);
    body.set('client_secret', env.CLIENT_SECRET);
    body.set('redirect_uri', env.REDIRECT_URI);
    body.set('grant_type', 'authorization_code');

    const tokenResp = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });

    if (!tokenResp.ok) {
      const errorText = await tokenResp.text();
      console.error('Token exchange failed:', errorText);
      return new Response(`Token exchange failed: ${tokenResp.status}`, { status: 400 });
    }

    const tokens = await tokenResp.json();
    
    if (!tokens.access_token) {
      return new Response('Token exchange failed - no access token', { status: 400 });
    }

    const userInfoResp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { 'Authorization': `Bearer ${tokens.access_token}` }
    });

    const userInfo = userInfoResp.ok ? await userInfoResp.json() : {};

    const headers = new Headers();
    const returnUrl = parsed.returnTo || 'https://virtual-machine.pages.dev';
    
    headers.append('Location', returnUrl);
    headers.append('Set-Cookie', `oauth_state=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax; Domain=virtual-machine.pages.dev`);
    headers.append('Set-Cookie', `access_token=${tokens.access_token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=3600; Domain=virtual-machine.pages.dev`);
    
    if (tokens.refresh_token) {
      headers.append('Set-Cookie', `refresh_token=${tokens.refresh_token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000; Domain=virtual-machine.pages.dev`);
    }
    
    const userCookie = JSON.stringify({
      name: userInfo.name || 'User',
      email: userInfo.email || '',
      picture: userInfo.picture || '',
    });
    
    headers.append('Set-Cookie', `user_info=${encodeURIComponent(userCookie)}; Secure; SameSite=Lax; Path=/; Max-Age=3600; Domain=virtual-machine.pages.dev`);

    return new Response(null, { status: 302, headers });
    
  } catch (error) {
    console.error('Callback error:', error);
    return new Response(`Internal server error: ${error.message}`, { status: 500 });
  }
}
