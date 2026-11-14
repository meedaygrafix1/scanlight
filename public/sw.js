/* Scanlight service worker: makes the app open with no connection.
   Pages: network first, so a new release shows up as soon as you are online.
   Everything else (hashed scripts, styles, fonts, icons): cache first. */
const CACHE = 'scanlight-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data?.type !== 'cache' || !Array.isArray(e.data.urls)) return;
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(e.data.urls
      .filter((u) => typeof u === 'string' && u.startsWith(self.location.origin))
      .map((u) => cache.match(u).then((hit) => hit || cache.add(u).catch(() => {}))));
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const put = (res) => { if (res.ok && res.type === 'basic') cache.put(req, res.clone()); return res; };
    if (req.mode === 'navigate') {
      try { return put(await fetch(req)); }
      catch { return (await cache.match(req)) || (await cache.match('/')) || Response.error(); }
    }
    return (await cache.match(req)) || put(await fetch(req));
  })());
});
