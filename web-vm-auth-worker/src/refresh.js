export async function onRequestGet({ request, env }) {
  const TOKEN_URL = 'https://oauth2.googleapis.com/token';
  
  const cookieHeader = request.headers.get('Cookie') || '';
  const cookies = {};
  cookieHeader.split(';').forEach(cookie => {
    const [key, ...valueParts] = cookie.trim().split('=');
    const value = valueParts.join('=');
    if (key && value) {
      cookies[key.trim()] = decodeURIComponent(value.trim());
    }
  });
  
  const refreshToken = cookies['refresh_token'];
  
  if (!refreshToken) {
    return new Response(JSON.stringify({ error: 'No refresh token available' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  try {
    const body = new URLSearchParams();
    body.set('client_id', env.CLIENT_ID);
    body.set('client_secret', env.CLIENT_SECRET);
    body.set('refresh_token', refreshToken);
    body.set('grant_type', 'refresh_token');
    
    const tokenResp = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });
    
    if (!tokenResp.ok) {
      throw new Error(`Token refresh failed: ${tokenResp.status}`);
    }
    
    const tokens = await tokenResp.json();
    
    const headers = new Headers({
      'Content-Type': 'application/json'
    });
    
    headers.append('Set-Cookie', `access_token=${tokens.access_token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=3600; Domain=virtual-machine.pages.dev`);
    
    return new Response(JSON.stringify({ 
      access_token: tokens.access_token,
      expires_in: tokens.expires_in 
    }), {
      status: 200,
      headers
    });
    
  } catch (error) {
    console.error('Refresh error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
