// ============================================
// SERVICE WORKER - MANNE TEILT v6
// ============================================

const CACHE_NAME = 'manneteil-v6';

// Dynamischer Basis-Pfad basierend auf Deployment-Stelle
const BASE_PATH = self.location.pathname.replace(/\/sw\.js$/, '').replace(/\/$/, '') || '/manneteil';

console.log('🔧 SW Loading with BASE_PATH:', BASE_PATH);

const ASSETS = [
    BASE_PATH + '/',
    BASE_PATH + '/index.html',
    BASE_PATH + '/styles.css',
    BASE_PATH + '/app.js',
    BASE_PATH + '/manifest.json'
];

self.addEventListener('install', (event) => {
    console.log('📦 SW Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('📁 Caching assets:', ASSETS);
            return cache.addAll(ASSETS);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('🚀 SW Activating...');
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.map((key) => {
                if (key !== CACHE_NAME) {
                    console.log('🗑️ Deleting old cache:', key);
                    return caches.delete(key);
                }
            }))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Supabase Requests -> immer network, optional cachen
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

    // Alle anderen Requests -> Cache-First
    event.respondWith(
        caches.match(request).then((cached) => {
            if (cached) return cached;
            return fetch(request);
        }).catch(() => {
            // Bei Fetch-Fehler: Fallback auf index.html für Navigation
            if (request.mode === 'navigate') {
                return caches.match(BASE_PATH + '/index.html');
            }
        })
    );
});
