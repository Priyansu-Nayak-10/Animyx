const CACHE_NAME = 'animyx-v3';
const ASSETS = [
  '/',
  '/index.html',
  '/pages/signin.html',
  '/pages/app.html',
  '/images/favicon.png'
];

// --- Installation: Cache essential assets ---
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Animyx SW] Caching essential assets');
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// --- Activation: Clean up old caches ---
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => (key === CACHE_NAME ? Promise.resolve() : caches.delete(key))));
    await clients.claim();
  })());
});

// --- Fetch: Cache-first strategy for local assets ---
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  
  const url = new URL(e.request.url);
  // Skip cross-origin and API requests to ensure features work perfectly
  if (url.origin !== location.origin || url.pathname.startsWith('/api') || e.request.url.includes('supabase') || e.request.url.includes('jikan')) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then((res) => {
      // Return cached version or fetch from network
      return res || fetch(e.request).catch(() => new Response("Network error", { status: 408 }));
    })
  );
});

// --- Push: Handle Web Push Notifications ---
self.addEventListener('push', function (event) {
  if (!event.data) return;

  try {
    const payload = event.data.json();
    const title = payload.title || 'Animyx Alert';
    const options = {
      body: payload.message || 'You have a new update.',
      icon: '/images/favicon.png',
      badge: '/images/favicon.png',
      vibrate: [200, 100, 200],
      data: {
        url: payload.url || '/'
      },
      requireInteraction: false
    };

    // Custom icons for specific notification types
    if (payload.type === 'SEQUEL_ANNOUNCED') {
      options.body = '📺 ' + options.body;
    } else if (payload.type === 'DUB_AVAILABLE') {
      options.body = '🎙️ ' + options.body;
    } else if (payload.type === 'FINISHED_AIRING') {
      options.body = '🏁 ' + options.body;
    }

    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    console.error('[Animyx SW] Push event error:', err);
  }
});

// --- Notification Click: Focus or open window ---
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const urlToOpen = event.notification.data.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
