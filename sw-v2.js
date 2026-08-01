const CACHE_NAME = 'geoportal-v2-avenza';
const TILE_CACHE = 'map-tiles-cache';

// Assets to cache immediately on install
const PRECACHE_ASSETS = [
    './',
    './index.html',
    './style.css?v=2',
    './main.js',
    './CAMADAS/BASE_FAZENDAS.js',
    './login.html',
    './login.css',
    './login.js',
    './manifest.json',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(PRECACHE_ASSETS);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME && cacheName !== TILE_CACHE) {
                        console.log('Purging old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // 1. Intercept Map Tiles (Esri, OSM, Carto)
    if (url.hostname.includes('arcgisonline.com') || 
        url.hostname.includes('tile.openstreetmap.org') || 
        url.hostname.includes('basemaps.cartocdn.com')) {
        
        event.respondWith(
            caches.open(TILE_CACHE).then(async (cache) => {
                const cachedResponse = await cache.match(event.request);
                if (cachedResponse) {
                    return cachedResponse;
                }
                try {
                    const networkResponse = await fetch(event.request);
                    if (networkResponse.ok) {
                        cache.put(event.request, networkResponse.clone());
                    }
                    return networkResponse;
                } catch (error) {
                    return new Response('', { status: 408, statusText: 'Offline' });
                }
            })
        );
        return;
    }

    // 2. Default Strategy: Network First, fallback to Cache
    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {
                if (networkResponse.ok && (url.origin === location.origin || url.hostname.includes('unpkg.com'))) {
                    const clone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, clone);
                    });
                }
                return networkResponse;
            })
            .catch(() => {
                return caches.match(event.request);
            })
    );
});
