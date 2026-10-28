// Only generic shell resources are cached. Local histories stay exclusively in IndexedDB.
const VERSION = new URL(self.location.href).searchParams.get('v');
const CACHE = `cheesit-shell-${VERSION}`;
const READY = '/__cheesit_offline_ready__';

async function verifyShell() {
  const cache = await caches.open(CACHE);
  const marker = await cache.match(READY);
  if (!marker) return { ready: false, version: VERSION };
  const manifest = await marker.json();
  if (manifest.version !== VERSION) return { ready: false, version: VERSION };
  const resources = await Promise.all(['/', ...manifest.assets].map(path => cache.match(path)));
  if (resources.some(resource => !resource)) return { ready: false, version: VERSION };
  return { ready: true, version: VERSION, resources: manifest.assets.length };
}

async function prepareShell() {
    if (!VERSION) throw new Error('Falta la versión de la aplicación.');
    const manifestResponse = await fetch(`/offline-manifest.json?v=${VERSION}`, { cache: 'no-store' });
    if (!manifestResponse.ok) throw new Error('No se pudo obtener la lista de recursos offline.');
    const manifest = await manifestResponse.json();
    if (manifest.version !== VERSION || !Array.isArray(manifest.assets) || !manifest.assets.length || manifest.assets.some(path => typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || path.includes('..') || path.startsWith('/api/'))) throw new Error('La versión offline no coincide con la aplicación.');
    const response = await fetch('/', { cache: 'no-store' });
    if (!response.ok) throw new Error('No se pudo preparar la aplicación.');
    const html = await response.clone().text();
    const initialAssets = [...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"?]+)(?:\?[^\"]*)?"/g)].map(match => match[1]);
    if (initialAssets.some(path => !manifest.assets.includes(path))) throw new Error('La aplicación cambió durante la preparación. Reintenta.');
    const cache = await caches.open(CACHE);
    try {
      await cache.addAll(manifest.assets.map(path => new Request(path, { cache: 'reload' })));
      await cache.put('/', response);
      await cache.put(READY, new Response(JSON.stringify(manifest), { headers: { 'Content-Type': 'application/json' } }));
      const status = await verifyShell();
      if (!status.ready) throw new Error('No se pudo verificar la copia offline.');
      return status;
    } catch (error) { await caches.delete(CACHE); throw error; }
}

self.addEventListener('install', event => {
  // Updates wait for the user's action, after the client has flushed pending local data.
  event.waitUntil(prepareShell());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'CHEESIT_OFFLINE_STATUS') event.waitUntil(verifyShell().then(status => event.ports[0]?.postMessage(status)).catch(() => event.ports[0]?.postMessage({ ready: false, version: VERSION })));
  if (event.data?.type === 'CHEESIT_PREPARE_OFFLINE') event.waitUntil(prepareShell().then(status => event.ports[0]?.postMessage(status)).catch(error => event.ports[0]?.postMessage({ ready: false, version: VERSION, error: error.message })));
  if (event.data?.type === 'CHEESIT_ACTIVATE_UPDATE') event.waitUntil(verifyShell().then(status => { if (status.ready) return self.skipWaiting(); }));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    if (!(await verifyShell()).ready) throw new Error('La copia offline no está completa.');
    // Keep the immediately previous immutable chunks for still-open tabs.
    const older = (await caches.keys()).filter(key => key.startsWith('cheesit-shell-') && key !== CACHE);
    for (const key of older.slice(0, -1)) await caches.delete(key);
    for (const key of await caches.keys()) if (key.startsWith('entrenos-shell-')) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(async () => (await (await caches.open(CACHE)).match('/')) || Response.error()));
  } else if (url.pathname.startsWith('/_next/static/')) {
    // Immutable hashed chunks from either current or immediately previous build are safe to reuse.
    event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
  } else if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/exercises/') || url.pathname.startsWith('/icon') || url.pathname === '/manifest.webmanifest') {
    event.respondWith(caches.open(CACHE).then(cache => cache.match(event.request)).then(cached => cached || fetch(event.request)));
  }
});
