/**
 * services/userService.js
 * Thin API service for all user-scoped backend calls.
 * Centralizes every authFetch + apiUrl pattern from userFeatures.js.
 *
 * All functions return the raw Response object.
 * Callers are responsible for error handling.
 */

import { authFetch, apiUrl } from '../config.js';

// ─── Profile ──────────────────────────────────────────────────────────────────

/** GET /users/me/profile */
export const getProfile = () =>
  authFetch(apiUrl('/users/me/profile'));

/**
 * PUT /users/me/profile
 * @param {{ name?: string, bio?: string, mal?: string, al?: string, avatar?: string, banner?: string }} data
 */
export const updateProfile = (data) =>
  authFetch(apiUrl('/users/me/profile'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

// ─── Settings ─────────────────────────────────────────────────────────────────

/** GET /users/me/settings */
export const getSettings = () =>
  authFetch(apiUrl('/users/me/settings'));

/**
 * PUT /users/me/settings
 * @param {object} data  snake_case settings payload
 */
export const updateSettings = (data) =>
  authFetch(apiUrl('/users/me/settings'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

// ─── Push Notifications ────────────────────────────────────────────────────────

/** GET /push/public-key  →  { publicKey: string } */
export const getPushPublicKey = () =>
  authFetch(apiUrl('/push/public-key'));

/**
 * POST /push/subscribe
 * @param {PushSubscription} subscription
 */
export const subscribePush = (subscription) =>
  authFetch(apiUrl('/push/subscribe'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription })
  });

/** POST /push/unsubscribe */
export const unsubscribePush = () =>
  authFetch(apiUrl('/push/unsubscribe'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });

// ─── Library ──────────────────────────────────────────────────────────────────

/** DELETE /users/me/library  — wipes the entire cloud library */
export const deleteCloudLibrary = () =>
  authFetch(apiUrl('/users/me/library'), { method: 'DELETE' });

// ─── Account / Cloud Data ─────────────────────────────────────────────────────

/** DELETE /users/me/cloud-data  — wipes all cloud data (library + profile + settings) */
export const deleteCloudData = () =>
  authFetch(apiUrl('/users/me/cloud-data'), { method: 'DELETE' });

/** DELETE /users/me  — permanently deletes the account */
export const deleteAccount = () =>
  authFetch(apiUrl('/users/me'), { method: 'DELETE' });

// ─── Import ───────────────────────────────────────────────────────────────────

/**
 * POST /import/mal  — uploads MAL XML export for import
 * @param {File} file  The .xml file from the user's file input
 */
export const importMal = (file) => {
  const formData = new FormData();
  formData.append('malExport', file);
  return authFetch(apiUrl('/import/mal'), { method: 'POST', body: formData });
};
