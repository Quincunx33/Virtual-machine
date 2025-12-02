export async function onRequestGet() {
  return new Response(null, {
    status: 302,
    headers: {
      Location: "/",
      "Set-Cookie": [
        "access_token=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax",
        "refresh_token=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax"
      ].join(",")
    }
  });
}
