export async function onRequestGet() {
  const headers = new Headers();
  const domain = "virtual-machine.pages.dev";
  const options = `Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax; Domain=${domain}`;

  headers.append('Location', '/');
  headers.append('Set-Cookie', `access_token=; ${options}`);
  headers.append('Set-Cookie', `refresh_token=; ${options}`);
  headers.append('Set-Cookie', `user_info=; Max-Age=0; Path=/; Secure; SameSite=Lax; Domain=${domain}`);
  headers.append('Set-Cookie', `oauth_state=; ${options}`);
  
  return new Response(null, {
    status: 302,
    headers
  });
}
