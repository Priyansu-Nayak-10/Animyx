import { BACKEND_ORIGIN, getAccessToken } from '../config.js';

let socket = null;

/**
 * Initialise the socket connection and subscribe to a user's notification room.
 *
 * @param {function}      onNotification - callback(notificationPayload)
 * @returns {object} socket instance
 */
function initSocket(onNotification) {
    if (typeof io === 'undefined') {
        console.warn('[Socket] Socket.IO global not found. Check CDN script tag in index.html.');
        return null;
    }

    // If already connected, disconnect first
    if (socket && socket.connected) {
        socket.disconnect();
    }

    // Force polling to work on restricted/public networks where WebSocket upgrades are blocked.
    // This avoids noisy "wss://... failed" errors and keeps notifications working reliably.
    socket = io(BACKEND_ORIGIN, {
        transports: ['polling'],
        upgrade: false,
        reconnectionAttempts: 5,
        reconnectionDelay: 2000,
        auth: {
            token: getAccessToken()
        }
    });

    socket.on('connect', () => {
        console.log('[Socket] Connected — id:', socket.id);
        socket.emit('subscribe');
    });

    // Receive real-time notification from backend
    socket.on('notification', (data) => {
        console.log('[Socket] Notification received:', data);
        if (typeof onNotification === 'function') {
            onNotification(data);
        }
    });

    socket.on('disconnect', (reason) => {
        console.log('[Socket] Disconnected:', reason);
    });

    socket.on('connect_error', (err) => {
        console.warn('[Socket] Connection error:', err.message);
    });

    socket.on('reconnect', (attempt) => {
        console.log(`[Socket] Reconnected after ${attempt} attempt(s)`);
        socket.emit('subscribe');
    });

    return socket;
}

export { initSocket } from './appCore.js';

