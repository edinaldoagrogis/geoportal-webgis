const CACHE_NAME = 'geoportal-v2';
const TILE_CACHE = 'map-tiles-cache';

// Assets to cache immediately on install
const PRECACHE_ASSETS = [
    './',
    './index.html',
    './style.css',
    './main.js',
    './CAMADAS/BASE_FAZENDAS.js',
    // Leaflet CDNs
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://unpkg.com/leaflet-measure@3.1.0/dist/leaflet-measure.css',
    'https://unpkg.com/leaflet-measure@3.1.0/dist/leaflet-measure.js'
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
                // Return cached tile if it exists
                if (cachedResponse) {
                    return cachedResponse;
                }
                
                // Otherwise fetch from network and cache it for offline use
                try {
                    const networkResponse = await fetch(event.request);
                    if (networkResponse.ok) {
                        cache.put(event.request, networkResponse.clone());
                    }
                    return networkResponse;
                } catch (error) {
                    // Offline and tile not in cache, let it fail gracefully
                    return new Response('', { status: 408, statusText: 'Offline' });
                }
            })
        );
        return;
    }

    // 2. Default Strategy for App Assets: Network First, fallback to Cache
    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {
                // If it's a valid response from our app domain or CDNs, update cache
                if (networkResponse.ok && (url.origin === location.origin || url.hostname.includes('unpkg.com'))) {
                    const clone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, clone);
                    });
                }
                return networkResponse;
            })
            .catch(() => {
                // Offline fallback
                return caches.match(event.request);
            })
    );
});
