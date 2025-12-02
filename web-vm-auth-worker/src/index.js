export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    
    // Route handling
    if (url.pathname === '/auth/start') {
      return (await import('./start.js')).onRequestGet({ request: req, env });
    }
    if (url.pathname === '/auth/callback') {
      return (await import('./callback.js')).onRequestGet({ request: req, env });
    }
    if (url.pathname === '/auth/logout') {
      return (await import('./logout.js')).onRequestGet();
    }
    if (url.pathname === '/auth/refresh') {
      return (await import('./refresh.js')).onRequestGet({ request: req, env });
    }
    if (url.pathname === '/auth/me') {
      return (await import('./user.js')).onRequestGet({ request: req });
    }
    
    // Health check endpoint
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response('Auth endpoint not found', { status: 404 });
  }
}
