// Instalo App — Service Worker v2 (Offline-capable)
const CACHE_NAME = 'instalo-app-v21';
const STATIC_ASSETS = [
  '/app.html',
  '/assets/icon.svg',
  '/manifest.json',
];

// Install: cache shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first for API (with offline fallback), cache-first for assets
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Edge Functions → NO interceptar (dejar pasar directo)
  if (url.hostname.includes('supabase') && url.pathname.includes('/functions/')) {
    return; // No llamar event.respondWith — el navegador gestiona la peticion directamente
  }

  // API calls → network first, notify app if offline
  if (url.hostname.includes('supabase')) {
    // Solo interceptar GETs para leer de cache offline
    // Las escrituras (POST/PATCH/DELETE) se manejan desde la app con la cola de sync
    event.respondWith(
      fetch(event.request).catch(err => {
        // Sin red — la app se encarga via IndexedDB
        return new Response(JSON.stringify({ error: 'offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // Static assets → cache first, fallback network
  event.respondWith(
    caches.match(event.request).then(cached => {
      // Devolver cache y actualizar en background (stale-while-revalidate)
      const fetchPromise = fetch(event.request).then(response => {
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);

      return cached || fetchPromise;
    }).catch(() => {
      if (event.request.mode === 'navigate') {
        return caches.match('/app.html');
      }
    })
  );
});
