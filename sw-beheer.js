// Minimale service worker voor de beheer-app (alleen om installeren mogelijk te maken).
// Slaat niets op: alle verzoeken gaan gewoon naar het netwerk.
self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  if (e.request.mode === 'navigate') e.respondWith(fetch(e.request));
});
