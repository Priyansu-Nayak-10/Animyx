const CACHE_NAME = 'animyx-v3';
const ASSETS = [
  '/',
  '/index.html',
  '/pages/signin.html',
  '/pages/app.html',
  '/images/favicon.png'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // Clean up old caches after deployments to avoid stale assets across browsers/devices.
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => (key === CACHE_NAME ? Promise.resolve() : caches.delete(key))));
    await clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  // Only cache GET requests
  if (e.request.method !== 'GET') return;
  
  // Skip cross-origin and API requests to ensure features work perfectly
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || url.pathname.startsWith('/api') || e.request.url.includes('supabase') || e.request.url.includes('jikan')) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then((res) => {
      // Return cached version or fetch from network (and don't cache automatically)
      return res || fetch(e.request).catch(() => new Response("Network error"));
    })
  );
});
