// Service Worker for PWA offline caching
const CACHE_NAME = 'geoportal-cache-v2';
const URLs_TO_CACHE = [
  './',
  './index.html',
  './login.html',
  './login.css',
  './login.js',
  './style.css',
  './manifest.json',
  './main.js',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(URLs_TO_CACHE))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    ))
  );
});
