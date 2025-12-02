export async function onRequestGet({ request }) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const cookies = {};
  cookieHeader.split(';').forEach(cookie => {
    const parts = cookie.split('=').map(part => part.trim());
    if (parts.length === 2 && parts[0] && parts[1]) {
      try {
        cookies[parts[0]] = decodeURIComponent(parts[1]);
      } catch (e) {
        cookies[parts[0]] = parts[1];
      }
    }
  });

  const userInfoCookie = cookies['user_info'];

  if (!userInfoCookie) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const userInfo = JSON.parse(userInfoCookie);
    return new Response(JSON.stringify(userInfo), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    // Cookie is malformed
    return new Response(JSON.stringify({ error: 'Invalid session' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
