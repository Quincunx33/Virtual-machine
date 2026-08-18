// === WebVM Progressive Web App (PWA) Service Worker ===
const CACHE_NAME = 'webvm-offline-v3-ui-fix';

const CORE_ASSETS = [
    './',
    './index.html',
    './text.html',
    './vm-screen.html',
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
    'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Inter:wght@300;400;500;600&display=swap'
];

// Installation: Cache essential assets
self.addEventListener('install', (event) => {
    console.log('[Service Worker] Installing WebVM PWA Service Worker...');
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Service Worker] Pre-caching WebVM core assets & emulator binaries');
            return Promise.allSettled(
                CORE_ASSETS.map(url => 
                    fetch(url, { cache: 'no-cache' })
                        .then(res => {
                            if (res.ok) return cache.put(url, res);
                            console.warn(`[Service Worker] Could not cache: ${url} (${res.status})`);
                        })
                        .catch(err => console.warn(`[Service Worker] Failed fetching: ${url}`, err))
                )
            );
        }).then(() => self.skipWaiting())
    );
});

// Activation: Clean up old caches
self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Activating WebVM Service Worker...');
    event.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(
                keyList.map((key) => {
                    if (key !== CACHE_NAME) {
                        console.log('[Service Worker] Removing old cache:', key);
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch: Cache-first strategy for emulator binaries & local assets; Network-first for dynamic requests
self.addEventListener('fetch', (event) => {
    // Skip non-GET requests or browser extension requests
    if (event.request.method !== 'GET') return;
    if (!event.request.url.startsWith('http')) return;

    const url = new URL(event.request.url);

    // Cache-first for local assets, WebAssembly, and BIOS files
    const isLocalAsset = url.origin === location.origin || 
                         url.pathname.endsWith('.js') || 
                         url.pathname.endsWith('.wasm') || 
                         url.pathname.endsWith('.bin') ||
                         url.pathname.endsWith('.html');

    if (isLocalAsset) {
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                if (cachedResponse) {
                    // Return cached response immediately and update cache in background
                    fetch(event.request)
                        .then(networkResponse => {
                            if (networkResponse && networkResponse.ok) {
                                caches.open(CACHE_NAME).then(cache => cache.put(event.request, networkResponse));
                            }
                        })
                        .catch(() => {}); // Ignore network errors offline
                    return cachedResponse;
                }

                return fetch(event.request).then((networkResponse) => {
                    if (!networkResponse || !networkResponse.ok) return networkResponse;
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
                    return networkResponse;
                }).catch(() => {
                    // Offline fallback for html pages
                    if (event.request.headers.get('accept')?.includes('text/html')) {
                        return caches.match('./index.html') || caches.match('./vm-screen.html');
                    }
                });
            })
        );
        return;
    }

    // Network-first for other remote resources
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                if (response && response.ok) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
                }
                return response;
            })
            .catch(() => {
                return caches.match(event.request);
            })
    );
});

// Custom message listener for explicit cache commands
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'FORCE_PRECACHE') {
        console.log('[Service Worker] Explicit precache requested by user.');
        event.waitUntil(
            caches.open(CACHE_NAME).then((cache) => {
                return Promise.allSettled(
                    CORE_ASSETS.map(url => 
                        fetch(url, { cache: 'reload' })
                            .then(res => res.ok && cache.put(url, res))
                    )
                );
            }).then(() => {
                event.ports[0]?.postMessage({ success: true });
            })
        );
    }
});
