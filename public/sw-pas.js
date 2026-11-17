// Service worker voor de digitale BHV-pas: ontvangt BHV-alarmmeldingen.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { titel: 'BHV-alarm', tekst: e.data ? e.data.text() : '' }; }
  const titel = d.titel || 'BHV-alarm';
  e.waitUntil(self.registration.showNotification(titel, {
    body: d.tekst || 'Kom direct in actie.',
    icon: '/icon-192.png',
    badge: '/favicon-64.png',
    tag: d.alarm || 'skb-bhv',
    renotify: true,
    requireInteraction: !!d.alarm,
    vibrate: d.alarm ? [600, 200, 600, 200, 600, 200, 600] : [200],
    data: { url: d.url || '/pas/' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/pas/', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lijst) => {
    for (const c of lijst) {
      if (c.url.includes('/pas') && 'focus' in c) { c.navigate(url); return c.focus(); }
    }
    return self.clients.openWindow(url);
  }));
});
