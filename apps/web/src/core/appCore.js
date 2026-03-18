import { createApiClient, API_BASE, DEFAULT_LIVE_UPCOMING_ENDPOINT } from './api.js';
import { authFetch, apiUrl, BACKEND_ORIGIN, getAccessToken } from '../config.js';
import { getClientId } from './clientId.js';
import { supabase } from './supabaseClient.js';
import { getState, setState } from '../store.js';

// ---------------------------------------------------------------------------
// Socket
// ---------------------------------------------------------------------------

let socket = null;

function initSocket(onNotification) {
  if (typeof io === 'undefined') {
    console.warn('[Socket] Socket.IO global not found. Check CDN script tag in index.html.');
    return null;
  }

  if (socket && socket.connected) {
    socket.disconnect();
  }

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

// ---------------------------------------------------------------------------
// Data store (previously core/datastore.js)
// ---------------------------------------------------------------------------

const DEFAULT_STATE = Object.freeze({
  airing: [],
  trending: [],
  seasonal: [],
  top: [],
  liveUpcoming: [],
  nextEpisodes: [],
  searchResults: [],
  searchMeta: {
    currentPage: 1,
    hasNextPage: false,
    lastVisiblePage: 1,
    totalItems: 0,
    itemsPerPage: 25
  },
  news: [],
  loading: {
    airing: false,
    trending: false,
    seasonal: false,
    top: false,
    liveUpcoming: false,
    search: false,
    news: false
  },
  errors: {}
});

function clone(data) {
  if (typeof structuredClone === "function") return structuredClone(data);
  return JSON.parse(JSON.stringify(data));
}

function createDataStore(initialState = {}, options = {}) {
  const debug = Boolean(options?.debug);
  let state = clone({ ...DEFAULT_STATE, ...initialState });
  const listeners = new Set();
  let notifyQueued = false;
  let batchPrevState = null;
  let batchMeta = [];
  const enqueueMicrotask = typeof queueMicrotask === "function"
    ? queueMicrotask.bind(globalThis)
    : (fn) => Promise.resolve().then(fn);

  function debugLog(prevState, nextState, meta = {}) {
    if (!debug) return;
    const changedKeys = new Set([
      ...Object.keys(prevState || {}),
      ...Object.keys(nextState || {})
    ]);
    const changed = [...changedKeys].filter((key) => {
      return JSON.stringify(prevState?.[key]) !== JSON.stringify(nextState?.[key]);
    });
    const loadingTransitions = {};
    const prevLoading = prevState?.loading || {};
    const nextLoading = nextState?.loading || {};
    Object.keys({ ...prevLoading, ...nextLoading }).forEach((key) => {
      if (Boolean(prevLoading[key]) === Boolean(nextLoading[key])) return;
      loadingTransitions[key] = { from: Boolean(prevLoading[key]), to: Boolean(nextLoading[key]) };
    });
    const errorTransitions = {};
    const prevErrors = prevState?.errors || {};
    const nextErrors = nextState?.errors || {};
    Object.keys({ ...prevErrors, ...nextErrors }).forEach((key) => {
      const from = String(prevErrors[key] || "");
      const to = String(nextErrors[key] || "");
      if (from === to) return;
      errorTransitions[key] = { from, to };
    });

    console.groupCollapsed(
      `[DataStore] ${meta.type || "update"}${meta.key ? `:${meta.key}` : ""}`
    );
    console.log("changedKeys", changed);
    if (Object.keys(loadingTransitions).length) console.log("loadingTransitions", loadingTransitions);
    if (Object.keys(errorTransitions).length) console.log("errorTransitions", errorTransitions);
    if (meta.type === "set" || meta.type === "patch") console.log("payload", meta.payload);
    console.groupEnd();
  }

  function flushNotify() {
    notifyQueued = false;
    const prevState = batchPrevState || state;
    const meta = batchMeta.length <= 1
      ? (batchMeta[0] || { type: "update" })
      : { type: "batch", payload: batchMeta };
    batchPrevState = null;
    batchMeta = [];

    debugLog(prevState, state, meta);
    const snapshot = clone(state);
    listeners.forEach((listener) => listener(snapshot));
  }

  function scheduleNotify(meta = {}, prevState = state) {
    if (!batchPrevState) batchPrevState = prevState;
    batchMeta.push(meta || { type: "update" });
    if (notifyQueued) return;
    notifyQueued = true;
    enqueueMicrotask(flushNotify);
  }

  function getState() {
    return clone(state);
  }

  function set(key, value) {
    const prevState = state;
    state = { ...state, [key]: value };
    scheduleNotify({ type: "set", key, payload: value }, prevState);
  }

  function patch(partial) {
    const prevState = state;
    state = { ...state, ...(partial || {}) };
    scheduleNotify({ type: "patch", payload: partial || {} }, prevState);
  }

  function setLoading(key, value) {
    const prevState = state;
    state = {
      ...state,
      loading: {
        ...state.loading,
        [key]: Boolean(value)
      }
    };
    scheduleNotify({ type: "loading", key, payload: Boolean(value) }, prevState);
  }

  function setError(key, errorValue) {
    const prevState = state;
    const nextErrors = { ...state.errors };
    if (errorValue) nextErrors[key] = String(errorValue);
    else delete nextErrors[key];
    state = { ...state, errors: nextErrors };
    scheduleNotify({ type: "error", key, payload: errorValue || "" }, prevState);
  }

  function subscribe(listener) {
    if (typeof listener !== "function") return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return Object.freeze({
    getState,
    set,
    patch,
    setLoading,
    setError,
    subscribe
  });
}

// ---------------------------------------------------------------------------
// Selectors (previously core/selectors.js)
// ---------------------------------------------------------------------------

function uniqueByMalId(items = []) {
  const map = new Map();
  items.forEach((item) => {
    const malId = Number(item?.malId || 0);
    if (!malId) return;
    map.set(malId, item);
  });
  return [...map.values()];
}

function listSignature(items = [], projector = (item) => String(item?.malId || 0)) {
  if (!Array.isArray(items) || !items.length) return "0";
  return `${items.length}|${items.map((item) => projector(item)).join(",")}`;
}

function createMemoizedSelector(projectSignature, computeResult) {
  let lastSig = "";
  let lastResult = null;
  return function memoizedSelector(...args) {
    const nextSig = String(projectSignature(...args));
    if (nextSig === lastSig && lastResult !== null) return lastResult;
    lastSig = nextSig;
    lastResult = computeResult(...args);
    return lastResult;
  };
}

function getCombinedDiscoveryState(storeState) {
  return getCombinedDiscoveryStateMemo(storeState);
}

const getCombinedDiscoveryStateMemo = createMemoizedSelector(
  (storeState) => {
    const seasonalSig = listSignature(storeState?.seasonal || []);
    const trendingSig = listSignature(storeState?.trending || []);
    const topSig = listSignature(storeState?.top || []);
    const airingSig = listSignature(storeState?.airing || []);
    return `${seasonalSig}::${trendingSig}::${topSig}::${airingSig}`;
  },
  (storeState) => uniqueByMalId([
    ...(storeState?.seasonal || []),
    ...(storeState?.trending || []),
    ...(storeState?.top || []),
    ...(storeState?.airing || [])
  ])
);

function isCurrentlyAiringStatus(value) {
  const status = String(value || "").toLowerCase();
  return status.includes("airing") && !status.includes("finished");
}

function computeAnikotoRank(anime, trendingIds, libraryById) {
  let score = 0;

  if (isCurrentlyAiringStatus(anime?.status)) score += 50;

  const popularity = Number(anime?.popularity || 0);
  if (popularity > 0) score += 1000 / popularity;

  const malScore = Number(anime?.score || 0);
  if (malScore > 0) score += malScore * 5;

  const malId = Number(anime?.malId || 0);
  const libraryRow = libraryById.get(malId);
  if (libraryRow) score += 40;
  const updatedAt = Number(libraryRow?.updatedAt || 0);
  if (updatedAt > 0 && (Date.now() - updatedAt) <= (7 * 24 * 60 * 60 * 1000)) score += 30;

  if (popularity > 5000) score -= 20;

  if (trendingIds.has(malId)) score += 20;

  return score;
}

function getTopOngoingAnikoto(storeState, limit = 10, libraryItems = []) {
  const airing = Array.isArray(storeState?.airing) ? storeState.airing : [];
  const trending = Array.isArray(storeState?.trending) ? storeState.trending : [];

  const merged = new Map();
  [...airing, ...trending].forEach((anime) => {
    const malId = Number(anime?.malId || 0);
    if (!malId) return;
    if (!merged.has(malId)) merged.set(malId, anime);
  });

  const trendingIds = new Set(trending.map((anime) => Number(anime?.malId || 0)).filter(Boolean));
  const libraryById = new Map(
    (libraryItems || [])
      .map((item) => [Number(item?.malId || 0), item])
      .filter(([malId]) => malId)
  );

  return [...merged.values()]
    .filter((anime) => isCurrentlyAiringStatus(anime?.status))
    .map((anime) => ({
      ...anime,
      __rank: computeAnikotoRank(anime, trendingIds, libraryById)
    }))
    .sort((left, right) => Number(right?.__rank || 0) - Number(left?.__rank || 0))
    .slice(0, Math.max(1, Number(limit || 10)))
    .map(({ __rank, ...anime }) => anime);
}

function getLiveUpcoming() {
  return [];
}

function getPredictiveUpcoming() {
  return [];
}

function getUpcomingFeed() {
  return [];
}

function getHybridUpcoming() {
  return [];
}

function getEstimatedUpcomingGrouped() {
  return [];
}

function keepNearestEpisodePerAnime() {
  return [];
}

function getCleanUpcoming() {
  return [];
}

function getUpcomingForCarousel() {
  return [];
}

// ---------------------------------------------------------------------------
// Realtime sync service (previously core/syncService.js)
// ---------------------------------------------------------------------------

class SyncService {
  constructor() {
    this.channels = new Map();
    this.isAuthenticated = false;
    this.currentUser = null;
    this.libraryStore = null;
  }

  async init({ libraryStore }) {
    this.libraryStore = libraryStore;

    this.currentUser = getState('currentUser');
    // `isAuthenticated` isn't consistently persisted; `currentUser` is the source of truth here.
    if (this.currentUser?.id) {
      this.subscribe();
    }
  }

  subscribe() {
    const userId = this.currentUser?.id;
    if (!userId) return;

    console.log('[SyncService] 📡 Subscribing to real-time updates...');

    // 1. Library Sync Channel
    const libraryChannel = supabase
      .channel(`sync:library:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'followed_anime', filter: `user_id=eq.${userId}` },
        (payload) => this.handleLibraryChange(payload)
      )
      .subscribe();

    // 2. Profile Sync Channel
    const profileChannel = supabase
      .channel(`sync:profile:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_profiles', filter: `user_id=eq.${userId}` },
        (payload) => this.handleProfileChange(payload)
      )
      .subscribe();

    // 3. Settings Sync Channel
    const settingsChannel = supabase
      .channel(`sync:settings:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_settings', filter: `user_id=eq.${userId}` },
        (payload) => this.handleSettingsChange(payload)
      )
      .subscribe();

    this.channels.set('library', libraryChannel);
    this.channels.set('profile', profileChannel);
    this.channels.set('settings', settingsChannel);
  }

  unsubscribe() {
    this.channels.forEach((channel) => supabase.removeChannel(channel));
    this.channels.clear();
  }

  handleLibraryChange(payload) {
    if (!this.libraryStore) return;

    const { eventType, new: newItem, old: oldItem } = payload;
    console.log('[SyncService] Library change received:', eventType);

    if (eventType === 'INSERT' || eventType === 'UPDATE') {
      // Ignore our own writes echoed back via realtime (prevents device/tab feedback loops).
      const localClientId = getClientId();
      const remoteClientId = String(newItem?.client_id || '');
      if (remoteClientId && remoteClientId === localClientId) return;

      // Tell CloudSync we're applying a remote change so it doesn't push it back.
      window.dispatchEvent(new CustomEvent('Animyx:library-sync-applying', {
        detail: { source: 'supabase', eventType, malId: newItem?.mal_id || null }
      }));

      const malId = Number(newItem?.mal_id || 0);
      const progress = Math.max(0, Number(newItem?.next_episode || 0));
      const episodes = Math.max(0, Number(newItem?.total_episodes || 0));
      const status = String(newItem?.status || 'plan').toLowerCase();
      const remoteUpdatedAt = Date.parse(newItem?.updated_at || newItem?.last_checked || newItem?.created_at) || 0;
      const remoteWatchProgressAt = Date.parse(newItem?.watch_progress_at || '') || 0;
      const remoteCompletedAt = Date.parse(newItem?.completed_at || '') || 0;
      const remoteRatingUpdatedAt = Date.parse(newItem?.rating_updated_at || '') || 0;
      const remoteWatchlistAddedAt = Date.parse(newItem?.watchlist_added_at || '') || 0;
      const remoteUserRatingRaw = Number(newItem?.user_rating);
      const remoteUserRating = Number.isFinite(remoteUserRatingRaw) && remoteUserRatingRaw > 0 ? remoteUserRatingRaw : null;

      // Per-field conflict resolution (merge, not overwrite):
      // Compare the remote field timestamps to local timestamps so progress + rating updates don't clobber each other.
      const local = this.libraryStore.getAll().find((row) => Number(row?.malId || 0) === malId) || {};
      const localWatchProgressAt = Number(local?.watchProgressAt || 0) || 0;
      const localCompletedAt = Number(local?.completedAt || 0) || 0;
      const localRatingUpdatedAt = Number(local?.ratingUpdatedAt || 0) || 0;
      const localWatchlistAddedAt = Number(local?.watchlistAddedAt || 0) || 0;
      const localUpdatedAt = Number(local?.updatedAt || 0) || 0;

      const shouldTake = (remoteTs, localTs) => Number(remoteTs || 0) > Number(localTs || 0);

      const normalized = {
        malId,
        title: shouldTake(remoteUpdatedAt, localUpdatedAt)
          ? String(newItem?.title || `Anime #${malId}`)
          : (local?.title || String(newItem?.title || `Anime #${malId}`)),
        image: shouldTake(remoteUpdatedAt, localUpdatedAt)
          ? String(newItem?.image || '')
          : (local?.image || String(newItem?.image || '')),
        status: shouldTake(remoteUpdatedAt, localUpdatedAt) ? status : (local?.status || status),
        progress: shouldTake(remoteWatchProgressAt, localWatchProgressAt) ? progress : Number(local?.progress || 0),
        watchedEpisodes: shouldTake(remoteWatchProgressAt, localWatchProgressAt)
          ? progress
          : Number(local?.watchedEpisodes || local?.progress || 0),
        episodes,
        updatedAt: remoteUpdatedAt || Date.now(),
        watchProgressAt: shouldTake(remoteWatchProgressAt, localWatchProgressAt) ? remoteWatchProgressAt : localWatchProgressAt,
        completedAt: shouldTake(remoteCompletedAt, localCompletedAt) ? remoteCompletedAt : localCompletedAt,
        ratingUpdatedAt: shouldTake(remoteRatingUpdatedAt, localRatingUpdatedAt) ? remoteRatingUpdatedAt : localRatingUpdatedAt,
        watchlistAddedAt: shouldTake(remoteWatchlistAddedAt, localWatchlistAddedAt) ? remoteWatchlistAddedAt : localWatchlistAddedAt,
        userRating: shouldTake(remoteRatingUpdatedAt, localRatingUpdatedAt) ? remoteUserRating : (local?.userRating ?? remoteUserRating)
      };

      this.libraryStore.upsert(normalized, normalized.status);

      // Notify cloudSync to not push this change back
      window.dispatchEvent(new CustomEvent('Animyx:library-sync-received', { detail: normalized }));
    } else if (eventType === 'DELETE') {
      const localClientId = getClientId();
      const remoteClientId = String(oldItem?.client_id || '');
      if (remoteClientId && remoteClientId === localClientId) return;

      window.dispatchEvent(new CustomEvent('Animyx:library-sync-applying', {
        detail: { source: 'supabase', eventType, malId: oldItem?.mal_id || null }
      }));
      this.libraryStore.remove(oldItem.mal_id);
      window.dispatchEvent(new CustomEvent('Animyx:library-sync-received', { detail: { malId: oldItem?.mal_id || null, deleted: true } }));
    }
  }

  handleProfileChange(payload) {
    if (payload.eventType === 'DELETE') return;

    console.log('[SyncService] Profile change received');
    const data = payload.new;
    const profile = {
      name: data.name,
      bio: data.bio,
      avatar: data.avatar,
      banner: data.banner,
      mal: data.mal,
      al: data.al
    };

    // Update localStorage to trigger UI refresh (if userFeatures is listening)
    localStorage.setItem('Animyx_profile_v1', JSON.stringify(profile));

    // Dispatch custom event for UI components
    window.dispatchEvent(new CustomEvent('Animyx:profile-sync', { detail: profile }));
  }

  handleSettingsChange(payload) {
    if (payload.eventType === 'DELETE') return;

    console.log('[SyncService] Settings change received');
    const data = payload.new;
    const settings = {
      darkTheme: data.dark_theme,
      notifications: data.notifications,
      autoplay: data.autoplay,
      dataSaver: data.data_saver,
      titleLang: data.title_lang,
      defaultStatus: data.default_status,
      accentColor: data.accent_color
    };

    localStorage.setItem('Animyx_settings_v1', JSON.stringify(settings));

    // Update global store
    setState({
      theme: settings.darkTheme ? 'dark' : 'light',
      accentColor: settings.accentColor
    });

    window.dispatchEvent(new CustomEvent('Animyx:settings-sync', { detail: settings }));
  }
}

const syncService = new SyncService();

// ---------------------------------------------------------------------------
// Cloud library sync (previously core/cloudSync.js)
// ---------------------------------------------------------------------------

const cloudSyncApi = createApiClient();

const SYNC_DB = 'Animyx_sync_v1';
const SYNC_STORE = 'kv';
let syncDbPromise = null;

function openSyncDb() {
  if (syncDbPromise) return syncDbPromise;
  syncDbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(SYNC_DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(SYNC_STORE)) db.createObjectStore(SYNC_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return syncDbPromise;
}

async function syncKvSet(key, value) {
  const db = await openSyncDb();
  if (!db) return;
  await new Promise((resolve) => {
    const tx = db.transaction(SYNC_STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.objectStore(SYNC_STORE).put(value, key);
  });
}

async function syncKvGet(key) {
  const db = await openSyncDb();
  if (!db) return null;
  return await new Promise((resolve) => {
    const tx = db.transaction(SYNC_STORE, 'readonly');
    tx.onerror = () => resolve(null);
    const req = tx.objectStore(SYNC_STORE).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => resolve(null);
  });
}

function normalizeStatus(value) {
  const raw = String(value || '').toLowerCase();
  if (raw === 'watching' || raw === 'completed' || raw === 'dropped') return raw;
  return 'plan';
}

function normalizeGenreNames(value) {
  return (Array.isArray(value) ? value : [])
    .map((genre) => (typeof genre === 'string' ? genre : genre?.name))
    .map((genre) => String(genre || '').trim())
    .filter(Boolean);
}

function toLibraryItem(row) {
  const malId = Number(row?.mal_id || 0);
  const progress = Math.max(0, Number(row?.next_episode || 0));
  return {
    malId,
    title: String(row?.title || `Anime #${malId}`),
    image: row?.image || '',
    status: normalizeStatus(row?.status),
    progress,
    watchedEpisodes: progress,
    episodes: Math.max(0, Number(row?.total_episodes || 0)),
    updatedAt: Date.parse(row?.updated_at || row?.last_checked || row?.created_at || '') || Date.now(),
    watchlistAddedAt: Date.parse(row?.watchlist_added_at || '') || 0,
    watchProgressAt: Date.parse(row?.watch_progress_at || '') || 0,
    completedAt: Date.parse(row?.completed_at || '') || 0,
    ratingUpdatedAt: Date.parse(row?.rating_updated_at || '') || 0,
    genres: normalizeGenreNames(row?.genres),
    studio: String(row?.studio || '').trim(),
    duration: String(row?.duration || '').trim(),
    year: Number(row?.year || 0) || 0,
    score: Number(row?.score || 0) || 0,
    userRating: Number(row?.user_rating || row?.userRating || 0) || null
  };
}

function signature(items = []) {
  return [...(items || [])]
    .map((item) => ({
      malId: Number(item?.malId || 0),
      status: normalizeStatus(item?.status),
      progress: Math.max(0, Number(item?.progress ?? item?.watchedEpisodes ?? 0)),
      userRating: Number(item?.userRating || 0) || 0,
      updatedAt: Number(item?.updatedAt || 0),
      completedAt: Number(item?.completedAt || 0),
      watchProgressAt: Number(item?.watchProgressAt || 0),
      ratingUpdatedAt: Number(item?.ratingUpdatedAt || 0),
      watchlistAddedAt: Number(item?.watchlistAddedAt || 0)
    }))
    .filter((item) => item.malId)
    .sort((a, b) => a.malId - b.malId)
    .map((item) => `${item.malId}:${item.status}:${item.progress}:${item.userRating}:${item.updatedAt}:${item.completedAt}:${item.watchProgressAt}:${item.ratingUpdatedAt}:${item.watchlistAddedAt}`)
    .join('|');
}

async function pushLibrary(localItems) {
  const localById = new Map(
    (localItems || [])
      .map((item) => [Number(item?.malId || 0), item])
      .filter(([id]) => id)
  );

  const remoteRes = await authFetch(apiUrl('/users/me/followed'));
  if (!remoteRes.ok) {
    const error = new Error(`Remote diff load failed (${remoteRes.status})`);
    error.status = remoteRes.status;
    throw error;
  }
  const remoteJson = await remoteRes.json();
  const remoteRows = Array.isArray(remoteJson?.data) ? remoteJson.data : [];
  const remoteIds = new Set(remoteRows.map((row) => Number(row?.mal_id || 0)).filter(Boolean));

  const clientId = getClientId();
  const items = [...localById.values()].map((item) => {
    const progress = Math.max(0, Number(item?.progress ?? item?.watchedEpisodes ?? 0));
    return {
      malId: Number(item?.malId || 0),
      title: item?.title || '',
      image: item?.image || '',
      status: normalizeStatus(item?.status),
      nextEpisode: progress,
      totalEpisodes: Number(item?.episodes || 0),
      userRating: item?.userRating ?? null,
      watchlistAddedAt: Number(item?.watchlistAddedAt || 0) || 0,
      watchProgressAt: Number(item?.watchProgressAt || 0) || 0,
      completedAt: Number(item?.completedAt || 0) || 0,
      ratingUpdatedAt: Number(item?.ratingUpdatedAt || 0) || 0,
      clientId,
      mutationId: `${clientId}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`
    };
  });

  await authFetch(apiUrl('/users/me/follow/batch'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items })
  });

  const toRemove = [...remoteIds].filter((malId) => !localById.has(malId));
  if (toRemove.length) {
    await authFetch(apiUrl('/users/me/unfollow/batch'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ malIds: toRemove })
    });
  }
}

async function fetchRemoteLibrary() {
  const res = await authFetch(apiUrl('/users/me/followed'));
  if (!res.ok) {
    const error = new Error(`Remote load failed (${res.status})`);
    error.status = res.status;
    throw error;
  }
  const json = await res.json();
  const rows = Array.isArray(json?.data) ? json.data : [];
  return rows.map(toLibraryItem).filter((item) => Number(item?.malId || 0));
}

async function backfillMissingImages(store) {
  const items = store.getAll();
  const missing = items.filter((item) => !item.image);

  if (missing.length === 0) return;
  console.log(`[CloudSync] Backfilling images for ${missing.length} items...`);

  let updatedAny = false;
  for (const item of missing) {
    try {
      // Add a small delay to avoid hitting rate limits
      await new Promise((r) => setTimeout(r, 1000));

      const detailRes = await cloudSyncApi.getAnimeDetail(item.malId);
      const data = detailRes?.data || detailRes;
      const imageUrl = data?.images?.jpg?.large_image_url || data?.images?.jpg?.image_url;

      if (imageUrl) {
        item.image = imageUrl;
        item.genres = normalizeGenreNames(data.genres);
        item.studio = String(data?.studios?.[0]?.name || item?.studio || '').trim();
        item.duration = String(data?.duration || item?.duration || '').trim();
        item.score = Number(data?.score || item?.score || 0) || 0;
        item.year = data.year || 0;

        // Update local store silently to prevent loops, then just persist
        store.upsert(item, item.status);
        updatedAny = true;
      }
    } catch (err) {
      console.warn(`[CloudSync] Failed to backfill image for ${item.malId}:`, err);
    }
  }

  if (updatedAny) {
    // Only push if we actually got new images
    pushLibrary(store.getAll()).catch((e) => console.error('[CloudSync] Failed to push backfilled images', e));
  }
}

export function initLibraryCloudSync({ libraryStore, toast = null, syncIntervalMs = 120000 } = {}) {
  if (!libraryStore) return { destroy() {} };

  let destroyed = false;
  let syncing = false;
  let pendingSync = false;
  let suppressSync = false;
  let remoteApplyDepth = 0;
  let lastSyncedSig = '';
  let debounceTimer = 0;
  let intervalTimer = 0;
  let focusTimer = 0;
  let retryTimer = 0;
  let retryAttempt = 0;
  let lastSyncedAt = 0;
  let warnedUnavailable = false;
  let lastStatus = '';
  let hasPendingSync = false;

  function setStatus(next, extra = {}) {
    const value = String(next || '');
    const hasExtra = extra && typeof extra === 'object' && Object.keys(extra).length > 0;
    if (!value || (value === lastStatus && !hasExtra)) return;
    lastStatus = value;
    window.dispatchEvent(new CustomEvent('Animyx:sync-status', { detail: { state: value, ...extra } }));
  }

  function isOfflineError(error) {
    const msg = String(error?.message || '');
    return !navigator.onLine || msg.includes('Failed to fetch') || msg.includes('NetworkError');
  }

  function isAuthFailure(error) {
    const status = Number(error?.status || 0);
    return status === 401 || status === 403;
  }

  function clearRetryTimer() {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = 0;
  }

  function scheduleRetry(reason) {
    clearRetryTimer();
    retryAttempt = Math.max(0, Number(retryAttempt || 0));

    // Exponential backoff: 2s, 4s, 8s ... up to 2 minutes (+ a bit of jitter)
    const base = Math.min(120000, 2000 * (2 ** retryAttempt));
    const jitter = Math.floor(Math.random() * 600);
    const delayMs = base + jitter;

    retryAttempt += 1;
    void syncKvSet('retryAttempt', retryAttempt);

    setStatus('error', { message: String(reason || 'Sync failed'), retryInMs: delayMs });

    retryTimer = setTimeout(() => {
      retryTimer = 0;
      if (destroyed) return;
      if (!navigator.onLine) return;
      void runSync({ force: true });
    }, delayMs);
  }

  async function runSync({ force = false } = {}) {
    if (destroyed || syncing) return;
    if (!getAccessToken()) return;

    if (!navigator.onLine) {
      setStatus('offline', { queued: true });
      void syncKvSet('pendingSync', true);
      hasPendingSync = true;
      return;
    }

    const current = libraryStore.getAll();
    const sig = signature(current);
    if (!force && sig === lastSyncedSig) return;

    syncing = true;
    setStatus('syncing');
    try {
      await pushLibrary(current);
      lastSyncedSig = signature(libraryStore.getAll());
      void syncKvSet('pendingSync', false);
      hasPendingSync = false;
      lastSyncedAt = Date.now();
      void syncKvSet('lastSyncedAt', lastSyncedAt);
      retryAttempt = 0;
      void syncKvSet('retryAttempt', 0);
      clearRetryTimer();
      setStatus('synced', { lastSyncedAt });
    } catch (error) {
      console.warn('[CloudSync] Push failed:', error?.message || error);
      if (isOfflineError(error)) {
        setStatus('offline', { queued: true });
        void syncKvSet('pendingSync', true);
        hasPendingSync = true;
        return;
      }
      if (isAuthFailure(error)) {
        setStatus('error', { message: 'Auth required' });
        return;
      }

      void syncKvSet('pendingSync', true);
      hasPendingSync = true;
      scheduleRetry(error?.message || 'Server error');
    } finally {
      syncing = false;
      if (pendingSync) {
        pendingSync = false;
        void runSync({ force: true });
      }
    }
  }

  function shouldTake(remoteTs, localTs) {
    return Number(remoteTs || 0) > Number(localTs || 0);
  }

  function mergeRemoteLocal(remoteItems, localItems) {
    const localById = new Map((localItems || []).map((row) => [Number(row?.malId || 0), row]).filter(([id]) => id));
    const remoteById = new Map((remoteItems || []).map((row) => [Number(row?.malId || 0), row]).filter(([id]) => id));
    const ids = new Set([...localById.keys(), ...remoteById.keys()]);
    const merged = [];

    for (const id of ids) {
      const loc = localById.get(id) || {};
      const rem = remoteById.get(id) || null;

      if (!rem) {
        // Remote no longer has it: only keep locally if we have pending offline changes.
        if (hasPendingSync) merged.push(loc);
        continue;
      }

      const localUpdatedAt = Number(loc?.updatedAt || 0) || 0;
      const remoteUpdatedAt = Number(rem?.updatedAt || 0) || 0;
      const localWatchProgressAt = Number(loc?.watchProgressAt || 0) || 0;
      const remoteWatchProgressAt = Number(rem?.watchProgressAt || 0) || 0;
      const localCompletedAt = Number(loc?.completedAt || 0) || 0;
      const remoteCompletedAt = Number(rem?.completedAt || 0) || 0;
      const localRatingUpdatedAt = Number(loc?.ratingUpdatedAt || 0) || 0;
      const remoteRatingUpdatedAt = Number(rem?.ratingUpdatedAt || 0) || 0;
      const localWatchlistAddedAt = Number(loc?.watchlistAddedAt || 0) || 0;
      const remoteWatchlistAddedAt = Number(rem?.watchlistAddedAt || 0) || 0;

      const next = {
        ...loc,
        ...rem,
        title: shouldTake(remoteUpdatedAt, localUpdatedAt) ? rem.title : (loc.title || rem.title),
        image: shouldTake(remoteUpdatedAt, localUpdatedAt) ? (rem.image || loc.image || '') : (loc.image || rem.image || ''),
        status: shouldTake(remoteUpdatedAt, localUpdatedAt) ? rem.status : (loc.status || rem.status),
        progress: shouldTake(remoteWatchProgressAt, localWatchProgressAt) ? rem.progress : (loc.progress ?? rem.progress),
        watchedEpisodes: shouldTake(remoteWatchProgressAt, localWatchProgressAt)
          ? (rem.watchedEpisodes ?? rem.progress)
          : (loc.watchedEpisodes ?? loc.progress ?? rem.watchedEpisodes ?? rem.progress),
        userRating: shouldTake(remoteRatingUpdatedAt, localRatingUpdatedAt) ? rem.userRating : (loc.userRating ?? rem.userRating),
        watchProgressAt: shouldTake(remoteWatchProgressAt, localWatchProgressAt) ? remoteWatchProgressAt : localWatchProgressAt,
        completedAt: shouldTake(remoteCompletedAt, localCompletedAt) ? remoteCompletedAt : localCompletedAt,
        ratingUpdatedAt: shouldTake(remoteRatingUpdatedAt, localRatingUpdatedAt) ? remoteRatingUpdatedAt : localRatingUpdatedAt,
        watchlistAddedAt: shouldTake(remoteWatchlistAddedAt, localWatchlistAddedAt) ? remoteWatchlistAddedAt : localWatchlistAddedAt,
        updatedAt: Math.max(localUpdatedAt, remoteUpdatedAt, remoteWatchProgressAt, remoteRatingUpdatedAt, remoteCompletedAt)
      };

      merged.push(next);
    }

    merged.sort((a, b) => Number(a?.malId || 0) - Number(b?.malId || 0));
    return merged;
  }

  async function pullRemoteAndMerge({ force = false } = {}) {
    if (destroyed || syncing) return;
    if (!getAccessToken()) return;
    if (!navigator.onLine) return;
    if (hasPendingSync) return; // don't overwrite local offline edits

    try {
      const remote = await fetchRemoteLibrary();
      if (!remote.length) return;

      const local = libraryStore.getAll();
      const merged = mergeRemoteLocal(remote, local);
      if (!force && signature(local) === signature(merged)) return;

      suppressSync = true;
      window.dispatchEvent(new CustomEvent('Animyx:library-sync-applying', { detail: { source: 'pull', eventType: 'MERGE' } }));
      libraryStore.init(merged);
      suppressSync = false;
      lastSyncedSig = signature(libraryStore.getAll());
      setStatus('synced');
    } catch (error) {
      console.warn('[CloudSync] Pull failed:', error?.message || error);
      if (isOfflineError(error)) setStatus('offline');
    } finally {
      suppressSync = false;
    }
  }

  // Handle incoming real-time library updates by marking them as "already synced"
  window.addEventListener('Animyx:library-sync-received', (e) => {
    const detail = e?.detail;
    if (Array.isArray(detail)) {
      // Cross-tab sync (storage event): apply snapshot without re-persisting to avoid ping-pong loops.
      const localSig = signature(libraryStore.getAll());
      const incomingSig = signature(detail);
      if (incomingSig && incomingSig !== localSig) {
        suppressSync = true;
        window.dispatchEvent(new CustomEvent('Animyx:library-sync-applying', { detail: { source: 'tab', eventType: 'SNAPSHOT' } }));
        libraryStore.applyExternal(detail, { persist: false });
        suppressSync = false;
      }
      lastSyncedSig = signature(libraryStore.getAll());
      return;
    }

    lastSyncedSig = signature(libraryStore.getAll());
  });

  // Remote updates (Supabase realtime) must not be pushed back to the backend.
  // The event is fired before the store mutation so our subscribe handler can bail out.
  window.addEventListener('Animyx:library-sync-applying', () => {
    remoteApplyDepth += 1;
    const dec = () => { remoteApplyDepth = Math.max(0, remoteApplyDepth - 1); };
    if (typeof queueMicrotask === 'function') queueMicrotask(dec);
    else Promise.resolve().then(dec);
  });

  async function bootstrapSync() {
    if (!getAccessToken()) return;
    const local = libraryStore.getAll();

    try {
      const remote = await fetchRemoteLibrary();
      if (remote.length > 0) {
        const merged = mergeRemoteLocal(remote, local);

        suppressSync = true;
        window.dispatchEvent(new CustomEvent('Animyx:library-sync-applying', { detail: { source: 'bootstrap', eventType: 'MERGE' } }));
        libraryStore.init(merged);
        suppressSync = false;
        lastSyncedSig = signature(libraryStore.getAll());

        // Backfill images for items missing them (fire-and-forget)
        backfillMissingImages(libraryStore);
        return;
      }

      if (local.length > 0) {
        await runSync({ force: true });
      }
    } catch (error) {
      console.warn('[CloudSync] Bootstrap failed:', error?.message || error);
      if (isAuthFailure(error)) return;
      if (toast?.show && !warnedUnavailable) {
        warnedUnavailable = true;
        toast.show('Cloud sync unavailable. Using local library only.', 'error', 2400);
      }
    } finally {
      suppressSync = false;
    }
  }

  const unsubscribe = libraryStore.subscribe(() => {
    if (destroyed || suppressSync || remoteApplyDepth > 0) return;
    if (syncing) {
      pendingSync = true;
      return;
    }
    if (debounceTimer) clearTimeout(debounceTimer);
    if (!navigator.onLine) {
      setStatus('offline', { queued: true });
      void syncKvSet('pendingSync', true);
      hasPendingSync = true;
      return;
    }
    setStatus('syncing');
    debounceTimer = setTimeout(() => {
      void runSync();
    }, 1200);
  });

  intervalTimer = setInterval(() => {
    // Don't churn background tabs; we'll do an aggressive sync on focus/visibility.
    if (typeof document !== 'undefined' && document.hidden) return;
    void pullRemoteAndMerge();
    void runSync();
  }, Math.max(30000, Number(syncIntervalMs) || 120000));

  // Small delay avoids false negatives while auth state settles after load.
  setTimeout(() => {
    void bootstrapSync();
  }, 1200);

  window.addEventListener('online', () => {
    setStatus('syncing');
    void pullRemoteAndMerge({ force: true });
    void runSync({ force: true });
  });
  window.addEventListener('offline', () => setStatus('offline'));
  setStatus(navigator.onLine ? 'synced' : 'offline', { lastSyncedAt });

  const handleForeground = () => {
    if (destroyed) return;
    if (typeof document !== 'undefined' && document.visibilityState && document.visibilityState !== 'visible') return;
    if (!getAccessToken()) return;
    if (focusTimer) clearTimeout(focusTimer);
    focusTimer = setTimeout(() => {
      focusTimer = 0;
      if (!navigator.onLine) {
        setStatus('offline', { queued: hasPendingSync });
        return;
      }
      setStatus('syncing');
      void pullRemoteAndMerge({ force: true });
      void runSync({ force: true });
    }, 250);
  };

  window.addEventListener('focus', handleForeground, { passive: true });
  document.addEventListener('visibilitychange', handleForeground, { passive: true });

  // If we had an offline failure previously, force a sync on the next load.
  syncKvGet('pendingSync').then((pending) => {
    hasPendingSync = Boolean(pending);
    if (pending) void runSync({ force: true });
  });
  syncKvGet('retryAttempt').then((attempt) => {
    retryAttempt = Math.max(0, Number(attempt || 0));
  });
  syncKvGet('lastSyncedAt').then((value) => {
    lastSyncedAt = Math.max(0, Number(value || 0));
  });

  return Object.freeze({
    syncNow() {
      return runSync({ force: true });
    },
    destroy() {
      destroyed = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      if (intervalTimer) clearInterval(intervalTimer);
      if (focusTimer) clearTimeout(focusTimer);
      window.removeEventListener('focus', handleForeground);
      document.removeEventListener('visibilitychange', handleForeground);
      clearRetryTimer();
      unsubscribe?.();
    }
  });
}

export {
  createApiClient,
  API_BASE,
  DEFAULT_LIVE_UPCOMING_ENDPOINT,
  syncService,
  initSocket,
  DEFAULT_STATE,
  createDataStore,
  uniqueByMalId,
  getCombinedDiscoveryState,
  getLiveUpcoming,
  getPredictiveUpcoming,
  getUpcomingFeed,
  getHybridUpcoming,
  getEstimatedUpcomingGrouped,
  getTopOngoingAnikoto,
  getUpcomingForCarousel,
  keepNearestEpisodePerAnime,
  getCleanUpcoming
};
