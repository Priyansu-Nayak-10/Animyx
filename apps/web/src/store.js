/**
 * store/app.js — Global Application State
 * Lightweight reactive state store for Animyx frontend.
 */

import { KEY_SETTINGS, KEY_PROFILE, KEY_LIBRARY } from './shared/storageKeys.js';

// ─── Initial State ────────────────────────────────────────────────────────────
const initialState = {
  // Auth
  currentUser: null,         // { id, username, email, token }
  isAuthenticated: false,

  // UI
  activeView: 'dashboard',   // 'dashboard' | 'library' | 'search' | 'insights' | 'account'
  theme: 'dark',             // 'dark' | 'light'
  accentColor: 'var(--brand-primary)',
  sidebarCollapsed: false,
  modalOpen: null,           // null | 'animeDetail' | 'settings' | ...

  // Notifications
  unreadNotifications: 0,

  // Search
  lastSearchQuery: '',
  lastSearchResults: [],

  // Library
  followedAnime: [],

  // Airing
  currentlyAiring: [],
};

// ─── State Container ──────────────────────────────────────────────────────────
let state = { ...initialState };

// ─── Subscribers ─────────────────────────────────────────────────────────────
const subscribers = new Map();

/**
 * Get a specific key from state (or full state if no key given)
 * @param {string|undefined} key
 */
export const getState = (key) => (key ? state[key] : { ...state });

/**
 * Update one or more state keys and notify subscribers
 * @param {Partial<typeof initialState>} patch
 */
export const setState = (patch) => {
  const prev = { ...state };
  state = { ...state, ...patch };

  // Notify all relevant subscribers
  for (const [key, callbacks] of subscribers.entries()) {
    if (key in patch) {
      callbacks.forEach((cb) => cb(state[key], prev[key]));
    }
  }
};

/**
 * Subscribe to changes on a specific state key
 * @param {string} key
 * @param {function} callback - called with (newValue, oldValue)
 * @returns {function} unsubscribe
 */
export const subscribe = (key, callback) => {
  if (!subscribers.has(key)) subscribers.set(key, new Set());
  subscribers.get(key).add(callback);
  return () => subscribers.get(key).delete(callback);
};

/**
 * Reset state to initial values (e.g. on logout)
 */
export const resetState = () => {
  setState({ ...initialState });
};

/**
 * Persist key to localStorage
 */
export const persistKey = (key) => {
  subscribe(key, (val) => {
    try { localStorage.setItem(`Animyx:${key}`, JSON.stringify(val)); } catch (_) { }
  });
};

/**
 * Restore a persisted key from localStorage
 */
export const restoreKey = (key) => {
  try {
    const raw = localStorage.getItem(`Animyx:${key}`);
    if (raw !== null) setState({ [key]: JSON.parse(raw) });
  } catch (_) { }
};

// ─── Cross-Tab Sync ───────────────────────────────────────────────────────────
window.addEventListener('storage', (e) => {
  if (!e.key) return;

  // Handle store-level keys (Animyx:theme, Animyx:accentColor, etc.)
  if (e.key.startsWith('Animyx:')) {
    const key = e.key.replace('Animyx:', '');
    try {
      const newVal = e.newValue !== null ? JSON.parse(e.newValue) : null;
      if (JSON.stringify(state[key]) !== e.newValue) {
        setState({ [key]: newVal });
      }
    } catch (_) { }
    return;
  }

  // Handle settings changes from another tab
  if (e.key === KEY_SETTINGS) {
    try {
      const settings = e.newValue ? JSON.parse(e.newValue) : null;
      if (settings) {
        setState({
          theme: settings.darkTheme ? 'dark' : 'light',
          accentColor: settings.accentColor || 'var(--brand-primary)'
        });
        window.dispatchEvent(new CustomEvent('Animyx:settings-sync', { detail: settings }));
      }
    } catch (_) { }
    return;
  }

  // Handle profile changes from another tab
  if (e.key === KEY_PROFILE) {
    try {
      const profile = e.newValue ? JSON.parse(e.newValue) : null;
      if (profile) {
        window.dispatchEvent(new CustomEvent('Animyx:profile-sync', { detail: profile }));
      }
    } catch (_) { }
    return;
  }

  // Handle library changes from another tab
  if (e.key === KEY_LIBRARY) {
    try {
      const items = e.newValue ? JSON.parse(e.newValue) : [];
      if (Array.isArray(items)) {
        window.dispatchEvent(new CustomEvent('Animyx:library-sync-received', { detail: items }));
      }
    } catch (_) { }
    return;
  }
});

const STATUS = Object.freeze({
  PLAN: "plan",
  WATCHING: "watching",
  COMPLETED: "completed",
  DROPPED: "dropped"
});

const STORAGE_KEY = KEY_LIBRARY;
const LIBRARY_SCHEMA_VERSION = 1;
const LIBRARY_SCHEMA_KEY = `${STORAGE_KEY}:schema`;

function clone(data) {
  if (typeof structuredClone === "function") return structuredClone(data);
  return JSON.parse(JSON.stringify(data));
}

function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function normalizeStatusValue(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === STATUS.WATCHING || raw === STATUS.COMPLETED || raw === STATUS.DROPPED) return raw;
  return STATUS.PLAN;
}

function normalizeGenres(value) {
  return (Array.isArray(value) ? value : [])
    .map((genre) => (typeof genre === "string" ? genre : genre?.name))
    .map((genre) => String(genre || "").trim())
    .filter(Boolean);
}

function normalizeTitles(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function normalizeLibraryItem(item = {}) {
  const progress = Math.max(0, Number(item?.progress ?? item?.watchedEpisodes ?? 0));
  const watchedEpisodes = Math.max(0, Number(item?.watchedEpisodes ?? progress));
  const episodes = Math.max(0, Number(item?.episodes ?? item?.total_episodes ?? 0));
  return {
    ...item,
    malId: Number(item?.malId || item?.mal_id || 0),
    title: String(item?.title || item?.title_english || "").trim(),
    title_english: String(item?.title_english || "").trim(),
    titles: normalizeTitles(item?.titles),
    image: String(item?.image || item?.poster || "").trim(),
    status: normalizeStatusValue(item?.status),
    progress,
    watchedEpisodes,
    episodes,
    genres: normalizeGenres(item?.genres),
    studio: String(item?.studio || "").trim(),
    duration: String(item?.duration || "").trim(),
    year: Number(item?.year || 0) || 0,
    score: Number(item?.score || 0) || 0,
    userRating: Number.isFinite(Number(item?.userRating)) && Number(item?.userRating) > 0 ? Math.min(10, Math.max(1, Number(item.userRating))) : null,
    updatedAt: Number(item?.updatedAt || 0) || 0,
    watchlistAddedAt: Number(item?.watchlistAddedAt || 0) || 0,
    watchProgressAt: Number(item?.watchProgressAt || 0) || 0,
    completedAt: Number(item?.completedAt || 0) || 0,
    ratingUpdatedAt: Number(item?.ratingUpdatedAt || 0) || 0
  };
}

function createLibraryStore(options = {}) {
  const storageKey = options.storageKey || STORAGE_KEY;
  const storage = options.storage || globalThis.localStorage;
  const normalizeItem = typeof options.normalizeItem === "function" ? options.normalizeItem : normalizeLibraryItem;

  let items = [];
  let initialized = false;
  const listeners = new Set();

  function notify() {
    const snapshot = clone(items);
    listeners.forEach((listener) => listener(snapshot));
  }

  function persist() {
    if (!storage?.setItem) return;
    storage.setItem(storageKey, JSON.stringify(items));
    storage.setItem(LIBRARY_SCHEMA_KEY, String(LIBRARY_SCHEMA_VERSION));
  }

  function load() {
    if (!storage?.getItem) return [];
    try {
      const raw = storage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function init(defaultLibrary = []) {
    const stored = load();
    const source = stored.length ? stored : (Array.isArray(defaultLibrary) ? defaultLibrary : []);
    const normalized = source.map((item) => normalizeItem(item));
    const existingSchemaVersion = Number(storage?.getItem?.(LIBRARY_SCHEMA_KEY) || 0) || 0;
    const migrationNeeded = existingSchemaVersion < LIBRARY_SCHEMA_VERSION;
    const shapeChanged = safeStringify(source) !== safeStringify(normalized);
    items = normalized;
    initialized = true;
    if (migrationNeeded || shapeChanged || stored.length !== source.length) {
      persist();
    }
    notify();
    return clone(items);
  }

  function subscribe(listener) {
    if (typeof listener !== "function") return () => { };
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function getAll() {
    return clone(items);
  }

  function getByStatus(status) {
    return clone(items.filter((item) => item.status === status));
  }

  function getStats() {
    return {
      total: items.length,
      completed: items.filter((item) => item.status === STATUS.COMPLETED).length,
      watching: items.filter((item) => item.status === STATUS.WATCHING).length,
      plan: items.filter((item) => item.status === STATUS.PLAN).length
    };
  }

  function applyStatusFields(item, status, previousStatus) {
    const nextStatus = status || item?.status || STATUS.PLAN;
    let nextItem = { ...item, status: nextStatus };

    if (nextStatus === STATUS.COMPLETED) {
      // Use actual episode count; if unknown (0) default to current progress so completed = 100%
      const rawEpisodes = Number(nextItem?.episodes);
      const maxEpisodes = Number.isFinite(rawEpisodes) && rawEpisodes > 0
        ? rawEpisodes
        : Math.max(1, Number(nextItem?.progress || 0));
      nextItem = {
        ...nextItem,
        progress: Math.max(Number(nextItem?.progress || 0), maxEpisodes),
        watchedEpisodes: Math.max(Number(nextItem?.watchedEpisodes || 0), maxEpisodes),
        completedAt: previousStatus !== STATUS.COMPLETED
          ? Date.now()
          : (Number(nextItem?.completedAt || 0) || Date.now())
      };
    }

    if (nextStatus === STATUS.WATCHING) {
      const watched = Math.max(Number(nextItem?.watchedEpisodes ?? nextItem?.progress ?? 0), 0);
      nextItem = {
        ...nextItem,
        watchedEpisodes: watched,
        progress: Math.max(Number(nextItem?.progress || 0), watched)
      };
    }

    if (nextStatus === STATUS.PLAN) {
      nextItem = {
        ...nextItem,
        watchedEpisodes: Math.max(Number(nextItem?.watchedEpisodes || 0), 0),
        progress: Math.max(Number(nextItem?.progress || 0), 0)
      };
    }

    return nextItem;
  }

  function upsert(anime, status = STATUS.PLAN) {
    const malId = Number(anime?.malId || 0);
    if (!malId) return null;
    const idx = items.findIndex((entry) => Number(entry?.malId || 0) === malId);
    const previous = idx >= 0 ? items[idx] : null;
    const previousStatus = previous?.status || null;
    const merged = normalizeItem({
      ...anime,
      malId,
      status,
      progress: Math.max(0, Number(anime?.progress || 0)),
      watchedEpisodes: Math.max(0, Number(anime?.watchedEpisodes ?? anime?.progress ?? 0)),
      userRating: anime?.userRating ?? null,
      completedAt: anime?.completedAt ?? previous?.completedAt ?? null,
      watchProgressAt: anime?.watchProgressAt ?? previous?.watchProgressAt ?? null,
      ratingUpdatedAt: anime?.ratingUpdatedAt ?? previous?.ratingUpdatedAt ?? null,
      watchlistAddedAt: anime?.watchlistAddedAt ?? previous?.watchlistAddedAt ?? null,
      updatedAt: Date.now()
    });
    const prepared = applyStatusFields(merged, status, previousStatus);
    if (status === STATUS.PLAN && previousStatus !== STATUS.PLAN && !prepared.watchlistAddedAt) {
      prepared.watchlistAddedAt = Date.now();
    }
    if (status === STATUS.WATCHING && previousStatus !== STATUS.WATCHING && !prepared.watchProgressAt) {
      prepared.watchProgressAt = Date.now();
    }
    if (idx >= 0) items[idx] = { ...items[idx], ...prepared, status: prepared.status };
    else items.push(prepared);
    persist();
    notify();
    return clone(prepared);
  }

  function remove(malId) {
    const id = Number(malId || 0);
    const before = items.length;
    items = items.filter((entry) => Number(entry?.malId || 0) !== id);
    if (items.length !== before) {
      persist();
      notify();
    }
  }

  function removeMany(malIds = []) {
    const ids = (Array.isArray(malIds) ? malIds : [])
      .map((v) => Number(v || 0))
      .filter((v) => Number.isFinite(v) && v > 0);
    if (!ids.length) return;
    const before = items.length;
    const set = new Set(ids);
    items = items.filter((entry) => !set.has(Number(entry?.malId || 0)));
    if (items.length !== before) {
      persist();
      notify();
    }
  }

  function updateProgress(malId, delta) {
    const id = Number(malId || 0);
    const row = items.find((entry) => Number(entry?.malId || 0) === id);
    if (!row) return null;
    // If episode count is known, clamp progress to it; if unknown (0) allow free-form progress
    const rawMax = Number(row.episodes);
    const maxEpisodes = Number.isFinite(rawMax) && rawMax > 0 ? rawMax : Number.MAX_SAFE_INTEGER;
    const next = Math.max(0, Math.min(maxEpisodes, Number(row.progress || 0) + Number(delta || 0)));
    row.progress = next;
    row.watchedEpisodes = next;
    const previousStatus = row.status;
    let nextStatus = row.status;
    if (next > 0 && row.status === STATUS.PLAN) nextStatus = STATUS.WATCHING;
    row.status = nextStatus;
    row.updatedAt = Date.now();
    row.watchProgressAt = Date.now();
    Object.assign(row, applyStatusFields(row, nextStatus, previousStatus));
    persist();
    notify();
    return clone(row);
  }

  function setStatus(malId, status) {
    const id = Number(malId || 0);
    const row = items.find((entry) => Number(entry?.malId || 0) === id);
    if (!row) return null;
    const previousStatus = row.status;
    row.status = status;
    row.updatedAt = Date.now();
    if (status === STATUS.PLAN && previousStatus !== STATUS.PLAN) {
      row.watchlistAddedAt = Date.now();
    }
    if (status === STATUS.WATCHING && previousStatus !== STATUS.WATCHING) {
      row.watchProgressAt = Date.now();
    }
    Object.assign(row, applyStatusFields(row, status, previousStatus));
    persist();
    notify();
    return clone(row);
  }

  function setStatusMany(malIds = [], status) {
    const nextStatus = String(status || "").toLowerCase();
    if (!nextStatus) return;
    const ids = (Array.isArray(malIds) ? malIds : [])
      .map((v) => Number(v || 0))
      .filter((v) => Number.isFinite(v) && v > 0);
    if (!ids.length) return;
    const set = new Set(ids);

    let changed = false;
    for (const row of items) {
      const id = Number(row?.malId || 0);
      if (!set.has(id)) continue;
      const previousStatus = row.status;
      row.status = nextStatus;
      row.updatedAt = Date.now();
      if (nextStatus === STATUS.PLAN && previousStatus !== STATUS.PLAN) {
        row.watchlistAddedAt = Date.now();
      }
      if (nextStatus === STATUS.WATCHING && previousStatus !== STATUS.WATCHING) {
        row.watchProgressAt = Date.now();
      }
      Object.assign(row, applyStatusFields(row, nextStatus, previousStatus));
      changed = true;
    }

    if (changed) {
      persist();
      notify();
    }
  }

  function setRating(malId, rating) {
    const id = Number(malId || 0);
    const row = items.find((entry) => Number(entry?.malId || 0) === id);
    if (!row) return null;
    const numeric = Number(rating);
    row.userRating = Number.isFinite(numeric) && numeric > 0 ? Math.min(10, Math.max(1, numeric)) : null;
    row.updatedAt = Date.now();
    row.ratingUpdatedAt = Date.now();
    persist();
    notify();
    return clone(row);
  }

  function clear() {
    items = [];
    persist();
    notify();
    return [];
  }

  // Apply a new library snapshot coming from outside this tab (e.g. storage event or realtime).
  // By default we do NOT persist again to localStorage to avoid ping-pong loops between tabs.
  function applyExternal(nextItems = [], { persist: shouldPersist = false } = {}) {
    if (!Array.isArray(nextItems)) return clone(items);
    items = nextItems.map((item) => normalizeItem(item));
    initialized = true;
    if (shouldPersist) persist();
    notify();
    return clone(items);
  }

  return Object.freeze({
    constants: Object.freeze({ STATUS, STORAGE_KEY }),
    init,
    subscribe,
    getAll,
    getByStatus,
    getStats,
    upsert,
    remove,
    removeMany,
    updateProgress,
    setStatus,
    setStatusMany,
    setRating,
    clear,
    applyExternal,
    isReady() {
      return initialized;
    }
  });
}

export { STATUS, STORAGE_KEY, createLibraryStore };
