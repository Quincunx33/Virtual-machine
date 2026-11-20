const CACHE_NAME = 'webvm-offline-v5-blush-white';

const CORE_ASSETS = [
    './',
    './index.html',
    './text.html',
    './vm-screen.html',
    './landing.js',
    './dashboard.js',
    './vm-manager.js',
    './libv86.js',
    './v86.wasm',
    './seabios.bin',
    './vgabios.bin',
    './manifest.json',
    './src/assets/images/pwa_app_icon_1787090612548.jpg',
    'https://cdn.tailwindcss.com',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css',
    'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap'
];

async function toNonRedirectedResponse(response) {
    if (!response || !response.redirected) return response;
    const body = await response.clone().arrayBuffer();
    return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: new Headers(response.headers)
    });
}

async function precacheAsset(cache, url, fetchOptions) {
    try {
        const res = await fetch(url, fetchOptions);
        if (!res || !res.ok || res.type === 'opaque' || res.type === 'opaqueredirect') {
            return;
        }
        const finalUrl = res.url;
        const cleanRes = await toNonRedirectedResponse(res);
        await cache.put(url, cleanRes.clone());
        if (finalUrl && finalUrl.startsWith(self.location.origin)) {
            const finalPath = new URL(finalUrl).pathname;
            await cache.put(finalPath, cleanRes.clone());
        }
    } catch (_) {}
}

async function findCachedPage(request) {
    const directMatch = await caches.match(request, { ignoreSearch: true });
    if (directMatch) return toNonRedirectedResponse(directMatch);

    const pathname = new URL(request.url).pathname.toLowerCase();
    const candidates = pathname.includes('vm-screen')
        ? ['./vm-screen.html', './text.html', './index.html']
        : (pathname.endsWith('/text') || pathname.endsWith('/text.html'))
            ? ['./text.html', './index.html']
            : ['./index.html', './', './text.html'];

    for (const candidate of candidates) {
        const hit = await caches.match(candidate);
        if (hit) return toNonRedirectedResponse(hit);
    }
    return null;
}

async function handleNavigationRequest(request) {
    try {
        const networkResponse = await fetch(request);
        if (networkResponse.type === 'opaqueredirect') {
            return networkResponse;
        }
        if (networkResponse.redirected) {
            const cleanResponse = await toNonRedirectedResponse(networkResponse);
            if (cleanResponse && cleanResponse.ok) {
                const cache = await caches.open(CACHE_NAME);
                await cache.put(request, cleanResponse.clone());
            }
            return cleanResponse;
        }
        if (networkResponse.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (_) {
        const cached = await findCachedPage(request);
        if (cached) return cached;
        return new Response('Offline - Unable to reach WebVM.', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
    }
}

async function handleLocalAssetRequest(request) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
        const safeCached = await toNonRedirectedResponse(cachedResponse);
        fetch(request)
            .then(async (networkResponse) => {
                if (networkResponse && networkResponse.ok && networkResponse.type !== 'opaqueredirect') {
                    const clean = await toNonRedirectedResponse(networkResponse);
                    const cache = await caches.open(CACHE_NAME);
                    await cache.put(request, clean);
                }
            })
            .catch(() => {});
        return safeCached;
    }

    try {
        const networkResponse = await fetch(request);
        if (networkResponse.type === 'opaqueredirect') {
            return networkResponse;
        }
        if (networkResponse && networkResponse.ok) {
            const clean = await toNonRedirectedResponse(networkResponse);
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, clean.clone());
            return clean;
        }
        return networkResponse;
    } catch (_) {
        return Response.error();
    }
}

async function handleExternalRequest(request) {
    try {
        const response = await fetch(request);
        if (response && response.ok && !response.redirected) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, response.clone());
        }
        return response;
    } catch (_) {
        const cached = await caches.match(request);
        if (cached) return toNonRedirectedResponse(cached);
        return Response.error();
    }
}

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => Promise.allSettled(CORE_ASSETS.map((url) => precacheAsset(cache, url, { cache: 'no-cache' }))))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keyList) => Promise.all(keyList.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    if (!event.request.url.startsWith('http')) return;

    const url = new URL(event.request.url);
    const isSameOrigin = url.origin === self.location.origin;

    if (event.request.mode === 'navigate' && isSameOrigin) {
        event.respondWith(handleNavigationRequest(event.request));
        return;
    }

    const isLocalAsset = isSameOrigin ||
        url.pathname.endsWith('.js') ||
        url.pathname.endsWith('.wasm') ||
        url.pathname.endsWith('.bin') ||
        url.pathname.endsWith('.html');

    if (isLocalAsset) {
        event.respondWith(handleLocalAssetRequest(event.request));
        return;
    }

    event.respondWith(handleExternalRequest(event.request));
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'FORCE_PRECACHE') {
        event.waitUntil(
            caches.open(CACHE_NAME)
                .then((cache) => Promise.allSettled(CORE_ASSETS.map((url) => precacheAsset(cache, url, { cache: 'reload' }))))
                .then(() => {
                    event.ports[0]?.postMessage({ success: true });
                })
        );
    }
});
