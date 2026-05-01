// Instalo App — Service Worker (Offline-capable)
// CACHE_NAME debe coincidir con el "build" mostrado en el footer de app.html.
// Subir SIEMPRE este número cuando se modifique app.html o sw.js — si no, los
// móviles no detectarán cambio y seguirán sirviendo la versión vieja desde caché.
const CACHE_NAME = 'instalo-app-v172';
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

// ── Web Push: recibir notificaciones con la app cerrada ──
self.addEventListener('push', event => {
  let data = { title: '💬 Nuevo mensaje', body: '' };
  try {
    if (event.data) data = event.data.json();
  } catch (e) {}

  const options = {
    body: data.body || '',
    icon: '/assets/icon-180.png',
    badge: '/assets/icon-180.png',
    vibrate: [200, 100, 200],
    tag: 'chat-' + (data.data?.conversacion_id || 'general'),
    renotify: true,
    data: data.data || {}
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Click en la notificación push → abrir la app
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/app.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // Si la app ya está abierta, enfocarla
      for (const client of windowClients) {
        if (client.url.includes('app.html') || client.url.includes('instaloerp')) {
          client.focus();
          client.postMessage({ type: 'chat-push-click', conversacion_id: event.notification.data?.conversacion_id });
          return;
        }
      }
      // Si no está abierta, abrir nueva ventana
      return clients.openWindow(url);
    })
  );
});
