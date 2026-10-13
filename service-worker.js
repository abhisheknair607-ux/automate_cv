'use strict';
const CACHE = 'automate-cv-static-v1';
const ASSETS = [
  './', './index.html', './app.js', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './maskable-512.png', './apple-touch-icon.png'
];
self.addEventListener('install', evt => {
  evt.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', evt => {
  evt.waitUntil(Promise.all([self.clients.claim(), caches.keys().then(keys =>
    Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))]));
});
self.addEventListener('fetch', evt => {
  const req = evt.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Never touch Google login or Sheets.
  // Cache only the public installer assets, never credentials or app data.
  if (!ASSETS.some(asset => url.pathname.endsWith(asset.replace(/^\.\//, '')) ||
      (asset === './' && url.pathname.endsWith('/')))) return;
  evt.respondWith(fetch(req).then(resp => {
    if (resp.ok) { const copy = resp.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return resp;
  }).catch(() => caches.match(req).then(cached => cached || caches.match('./index.html'))));
});
