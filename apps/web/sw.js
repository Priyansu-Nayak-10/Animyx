/**
 * Animyx Service Worker
 * Handles Web Push Notifications
 */

self.addEventListener('push', function (event) {
    if (!event.data) return;

    try {
        const payload = event.data.json();

        const title = payload.title || 'Animyx Alert';
        const options = {
            body: payload.message || 'You have a new update.',
            icon: '/icon-192x192.png',
            badge: '/icon-192x192.png',
            vibrate: [200, 100, 200],
            data: {
                url: payload.url || '/'
            },
            requireInteraction: false
        };

        if (payload.type === 'SEQUEL_ANNOUNCED') {
            options.body = '?? ' + options.body;
        } else if (payload.type === 'DUB_AVAILABLE') {
            options.body = '?? ' + options.body;
        } else if (payload.type === 'FINISHED_AIRING') {
            options.body = '? ' + options.body;
        }

        event.waitUntil(self.registration.showNotification(title, options));
    } catch (err) {
        console.error('Push event error:', err);
    }
});

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
