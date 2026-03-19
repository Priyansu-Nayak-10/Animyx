/**
 * core/api.js
 * API client and Socket.IO initialization.
 */

import { authFetch, apiUrl, BACKEND_ORIGIN, getAccessToken } from "../config.js";

export const API_BASE = "https://api.jikan.moe/v4";
export const DEFAULT_LIVE_UPCOMING_ENDPOINT = "https://api.jikan.moe/v4/seasons/upcoming?limit=24";

export function createApiClient() {
  return {
    async getAnimeDetail(malId) {
      const res = await fetch(`${API_BASE}/anime/${malId}`);
      if (!res.ok) throw new Error(`Jikan API Error: ${res.status}`);
      return (await res.json()).data;
    },
    async getUpcoming(limit = 24) {
      const res = await fetch(`${API_BASE}/seasons/upcoming?limit=${limit}`);
      if (!res.ok) throw new Error(`Jikan API Error: ${res.status}`);
      return (await res.json()).data;
    }
  };
}

let socket = null;

export function initSocket(onNotification) {
  if (typeof io === 'undefined') {
    console.warn('[Socket] Socket.IO global not found.');
    return null;
  }
  if (socket && socket.connected) socket.disconnect();

  socket = io(BACKEND_ORIGIN, {
    transports: ['polling'],
    upgrade: false,
    reconnectionAttempts: 5,
    reconnectionDelay: 2000,
    auth: { token: getAccessToken() }
  });

  socket.on('connect', () => {
    console.log('[Socket] Connected — id:', socket.id);
    socket.emit('subscribe');
  });

  socket.on('notification', (data) => {
    if (typeof onNotification === 'function') onNotification(data);
  });

  return socket;
}
