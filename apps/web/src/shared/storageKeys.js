/**
 * shared/storageKeys.js
 * Single source of truth for ALL localStorage key strings used in Animyx.
 *
 * GOLDEN RULE: Never hard-code a storage key string anywhere else.
 * Import from here instead.
 */

/** Supabase current user object  { id, email, user_metadata, ... } */
export const KEY_CURRENT_USER = 'Animyx:currentUser';

/** Tracks the last active user ID between sessions (used for multi-account detection) */
export const KEY_LAST_USER_ID = 'Animyx:lastUserId';

/** User profile data  { name, bio, mal, al, avatar, banner } */
export const KEY_PROFILE = 'Animyx_profile_v1';

/** User settings data  { darkTheme, notifications, accentColor, ... } */
export const KEY_SETTINGS = 'Animyx_settings_v1';

/** UI theme override  'dark' | 'light' */
export const KEY_THEME = 'Animyx_theme';

/** Library data persisted per-user  keyed as `Animyx:library:${userId}` */
export const KEY_LIBRARY_PREFIX = 'Animyx:library:';

/** Legacy flat library storage key (used by createLibraryStore in store.js) */
export const KEY_LIBRARY = 'Animyx_library_v3';

/** Returns the per-user library key */
export const libraryKey = (userId) => `${KEY_LIBRARY_PREFIX}${userId}`;
