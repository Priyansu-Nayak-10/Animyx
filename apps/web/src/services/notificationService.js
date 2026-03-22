/**
 * services/notificationService.js
 * Thin API service for all notification backend calls.
 * Centralizes the authFetch + apiUrl patterns from notifications.js.
 */

import { authFetch, apiUrl } from '../config.js';

/**
 * GET /notifications/me?page=N&limit=N
 * @param {number} [page=1]
 * @param {number} [limit=100]
 */
export const getNotifications = (page = 1, limit = 100) =>
  authFetch(apiUrl(`/notifications/me?page=${page}&limit=${limit}`));

/**
 * PATCH /notifications/:id/read
 * @param {string|number} id
 */
export const markNotificationRead = (id) =>
  authFetch(apiUrl(`/notifications/${id}/read`), { method: 'PATCH' });

/** DELETE /notifications/me/clear */
export const clearNotifications = () =>
  authFetch(apiUrl('/notifications/me/clear'), { method: 'DELETE' });
