const CACHE_NAME = 'manneteilt-v6';
const BASE_PATH = self.location.pathname.replace('/sw.js', '');
const ASSETS = [
    BASE_PATH + '/',
    BASE_PATH + '/index.html',
    BASE_PATH + '/styles.css',
    BASE_PATH + '/app.js',
    BASE_PATH + '/manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.map((key) => {
                if (key !== CACHE_NAME) return caches.delete(key);
            }))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    if (url.hostname.includes('supabase')) {
        event.respondWith(
            fetch(request).then((response) => {
                const clone = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                return response;
            }).catch(() => caches.match(request))
        );
        return;
    }

    event.respondWith(
        caches.match(request).then((cached) => cached || fetch(request))
    );
});
