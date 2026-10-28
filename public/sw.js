// Cache only the generic application shell and immutable local resources; never cache API responses.
const CACHE = 'entrenos-shell-v20';
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const response = await fetch('/', { cache: 'reload' });
    if (!response.ok) throw new Error('No se pudo preparar la aplicación');
    const html = await response.clone().text();
    const assets = [...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"?]+)(?:\?[^\"]*)?"/g)].map((match) => match[1]);
    await cache.put('/', response);
    await cache.addAll([...new Set(['/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png', '/assets/grind-dumbbell.webp', '/assets/grind-athlete.png', '/assets/grind-bench-frames.png', '/assets/grind-avatar-base.png', '/assets/grind-gear.png', '/assets/grind-gear-mythic.png', '/assets/grind-companions.png', '/assets/grind-chest-iron.png', '/assets/grind-chest-energy.png', '/assets/grind-chest-legend.png', ...assets])]);
  })());
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('entrenos-shell-') && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(async () => (await caches.match('/')) || Response.error()));
  } else if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/exercises/') || url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icon')) {
    event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
  }
});
