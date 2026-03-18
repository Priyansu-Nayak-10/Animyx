/**
 * main.js — Animyx Frontend Bootstrap
 *
 * Initialises: theme, accent colour, socket, notifications, bell button toggle.
 * Loaded as <script type="module"> AFTER Socket.IO CDN script.
 */
import './features/auth/sessionBootstrap.js';



// ── All imports must be at the top of an ES module ───────────
import './components/AnimeCard.js';
import { initSocket, createApiClient } from './core/appCore.js';
import { loadNotifications, onSocketNotification, clearAllNotifications } from './features/notifications/notifications.js';
import { getState, setState, restoreKey, persistKey } from './store.js';
import { authFetch, apiUrl } from './config.js';
import { createDataStore, initLibraryCloudSync, syncService } from './core/appCore.js';
import * as selectors from './core/appCore.js';
import { createLibraryStore } from './store.js';
import { initInsights } from './features/dashboard/dashboard.js';
import { initSearchAdvanced } from './features/search/search.js';
import { initSeasonBrowser } from './features/season/seasonBrowser.js';
import { initUI } from './features/ui/ui.js';
import { initLibraryUI } from './features/library/library.js';
import { initDashboardModules, initMilestones, initTrackerFeed } from './features/dashboard/dashboard.js';
import { initProfile, initSettings, initExport, initImport } from './features/user/userFeatures.js';
import { normalizeAnime, dedupeAnimeList, bindNavigation, openView, initSectionReveal, initImageBlurUp } from './core/utils.js';

// --- Production Console Cleaner & PWA Setup ---
if (!window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1')) {
  console.log = function() {};
  console.info = function() {};
}
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      // Force update the service worker immediately on load
      reg.update();
    }).catch(err => console.error('PWA SW Failed:', err));
  });
}

// ── Restore persisted preferences ────────────────────────────
// Prioritize unified settings object
const settingsRaw = localStorage.getItem('Animyx_settings_v1');
if (settingsRaw) {
  try {
    const s = JSON.parse(settingsRaw);
    if (s.darkTheme !== undefined) setState({ theme: s.darkTheme ? 'dark' : 'light' });
    if (s.accentColor) setState({ accentColor: s.accentColor });
  } catch { }
} else {
  // Fallback to individual legacy keys
  restoreKey('theme');
  restoreKey('accentColor');
}

restoreKey('currentUser');

// Ensure changes are persisted back to their respective keys
persistKey('theme');
persistKey('accentColor');
persistKey('currentUser');

// ── Apply theme + accent ──────────────────────────────────────
const applyTheme = (theme) => {
  const next = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  document.body.classList.toggle('dark', next === 'dark');
  // Sync with localStorage for legacy / fallback
  try {
    localStorage.setItem('Animyx_theme', next);
  } catch { }
};

const applyAccent = (color) => {
  const allowedAccents = new Set(['#8b5cf6', '#7c3aed', '#6d28d9', '#a78bfa', '#c4b5fd', '#9333ea', '#7e22ce', '#581c87']);
  const nextColor = allowedAccents.has(String(color || '').toLowerCase()) ? String(color).toLowerCase() : '#8b5cf6';
  const root = document.documentElement;
  root.style.setProperty('--brand-primary', nextColor);
  root.style.setProperty('--accent', nextColor); // legacy fallback
};

// Initial application from synced state
applyTheme(getState('theme') || 'dark');
applyAccent(getState('accentColor') || '#8b5cf6');

// ── Bootstrap on DOMContentLoaded ─────────────────────────────
const initAuthEvents = async () => {
  await (window.__Animyx_AUTH_READY || Promise.resolve());
  console.log('[Animyx] 🚀 Starting...');

  // ── Notification bell wiring ────────────────────────────────
  const bellBtn = document.querySelector('.icon-btn');
  const notifPanel = document.getElementById('notif-panel');
  const markAllBtn = document.getElementById('notif-mark-all-btn');
  const clearBtn = document.getElementById('notif-clear-btn');

  // Inject badge into bell button
  if (bellBtn) {
    bellBtn.style.position = 'relative';
    const badge = document.createElement('span');
    badge.id = 'notif-badge';
    badge.style.display = 'none';
    bellBtn.appendChild(badge);

    // Toggle notification panel on bell click
    bellBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      notifPanel?.classList.toggle('open');
    });
  }

  // Close panel when clicking outside
  document.addEventListener('click', (e) => {
    if (notifPanel && !notifPanel.contains(e.target) && !e.target.closest('.icon-btn')) {
      notifPanel.classList.remove('open');
    }
  });

  // Mark all read
  if (markAllBtn) {
    markAllBtn.addEventListener('click', async () => {
      const user = getState('currentUser');
      if (!user?.id) return;
      await authFetch(apiUrl('/notifications/me/read-all'), { method: 'PATCH' });
      // Re-load to update UI
      await loadNotifications();
    });
  }

  // Clear all
  if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
      const user = getState('currentUser');
      if (!user?.id) return;
      await clearAllNotifications();
    });
  }

  // ── Theme toggle sync ──────────────────────────────────────
  const darkThemeToggle = document.getElementById('setting-dark-theme');
  const syncThemeToggleState = () => {
    if (darkThemeToggle) darkThemeToggle.checked = getState('theme') !== 'light';
  };
  if (darkThemeToggle) {
    syncThemeToggleState();
  }

  // ── User initialisation ─────────────────────────────────────
  const user = getState('currentUser');

  // Helper: forward a socket notification to the tracker feed (real-time)
  function forwardToTrackerFeed(notification) {
    globalThis._AnimyxTrackerFeed?.addEvent?.(notification);
  }

  if (user?.id) {
    // Fetch notifications from backend (relative URL — works on any port)
    await loadNotifications();

    // Open real-time socket connection with real user ID
    const socket = initSocket((notification) => {
      onSocketNotification(notification);
      forwardToTrackerFeed(notification);
    });
  } else {
    // No authenticated user — skip socket to avoid subscribing with wrong ID
    console.info('[Animyx] No user session — socket not connected.');
  }

  console.log('[Animyx] ✅ Ready');
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAuthEvents);
} else {
  initAuthEvents();
}

// normalizeAnime, bindNavigation, openView, and initSectionReveal are
// imported from their respective core modules above.

function createDataController({ api, store }) {
  const LIVE_REFRESH_LONG_MS = 10 * 60 * 1000; // > 6h
  const LIVE_REFRESH_MEDIUM_MS = 2 * 60 * 1000; // < 6h
  const LIVE_REFRESH_SHORT_MS = 30 * 1000; // < 1h
  const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
  const ONE_HOUR_MS = 60 * 60 * 1000;

  function buildSearchMeta(payload, requestedPage = 1) {
    const pagination = payload?.pagination || {};
    const items = pagination?.items || {};
    const currentPageRaw = Number(pagination?.current_page ?? requestedPage);
    const lastVisiblePageRaw = Number(pagination?.last_visible_page ?? currentPageRaw ?? requestedPage);
    const totalItemsRaw = Number(items?.total ?? 0);
    const itemsPerPageRaw = Number(items?.per_page ?? 25);
    return {
      currentPage: Number.isFinite(currentPageRaw) && currentPageRaw > 0 ? Math.trunc(currentPageRaw) : 1,
      hasNextPage: Boolean(pagination?.has_next_page),
      lastVisiblePage: Number.isFinite(lastVisiblePageRaw) && lastVisiblePageRaw > 0 ? Math.trunc(lastVisiblePageRaw) : 1,
      totalItems: Number.isFinite(totalItemsRaw) && totalItemsRaw >= 0 ? Math.trunc(totalItemsRaw) : 0,
      itemsPerPage: Number.isFinite(itemsPerPageRaw) && itemsPerPageRaw > 0 ? Math.trunc(itemsPerPageRaw) : 25
    };
  }

  function rowsFromPayload(payload) {
    const mapped = (Array.isArray(payload?.data) ? payload.data : []).map(normalizeAnime);
    return dedupeAnimeList(mapped);
  }

  async function loadAiring(limit = 24) {
    store.setLoading("airing", true);
    store.setError("airing", "");
    try {
      const rows = rowsFromPayload(await api.getAiring(limit));
      store.set("airing", rows);
      return rows;
    } catch {
      store.setError("airing", "Failed to load airing anime");
      return [];
    } finally {
      store.setLoading("airing", false);
    }
  }

  function normalizeLiveUpcomingRow(row, catalog = new Map()) {
    const malId = Number(row?.malId ?? row?.mal_id ?? 0);
    const releaseTimestamp = Number(
      row?.releaseTimestamp
      ?? row?.release_ts
      ?? row?.nextEpisodeTs
      ?? 0
    );
    if (!malId || !releaseTimestamp) return null;
    const base = catalog.get(malId) || {};
    const nextEpisodeNumberRaw = Number(row?.nextEpisodeNumber ?? row?.next_episode_number);
    const nextEpisodeNumber = Number.isFinite(nextEpisodeNumberRaw) ? nextEpisodeNumberRaw : null;
    return {
      malId,
      nextEpisodeNumber,
      releaseTimestamp,
      title: String(row?.title || base?.title || `Anime #${malId}`),
      image: String(row?.image || base?.image || ""),
      source: "server"
    };
  }

  async function loadTrending(limit = 24) {
    store.setLoading("trending", true);
    store.setError("trending", "");
    try {
      const rows = rowsFromPayload(await api.getTrending(limit));
      store.set("trending", rows);
      return rows;
    } catch {
      store.setError("trending", "Failed to load trending anime");
      return [];
    } finally {
      store.setLoading("trending", false);
    }
  }

  async function loadSeasonal(limit = 24) {
    store.setLoading("seasonal", true);
    store.setError("seasonal", "");
    try {
      const rows = rowsFromPayload(await api.getSeasonal(limit));
      store.set("seasonal", rows);
      return rows;
    } catch {
      store.setError("seasonal", "Failed to load seasonal anime");
      return [];
    } finally {
      store.setLoading("seasonal", false);
    }
  }

  async function loadTop(limit = 24) {
    store.setLoading("top", true);
    store.setError("top", "");
    try {
      const rows = rowsFromPayload(await api.getTop(limit));
      store.set("top", rows);
      return rows;
    } catch {
      store.setError("top", "Failed to load top anime");
      return [];
    } finally {
      store.setLoading("top", false);
    }
  }

  let searchSeq = 0;

  async function performSearch(query, page = 1, filters = {}) {
    const clean = String(query || "").trim();
    const hasFilters = Object.values(filters).some((value) => {
      if (Array.isArray(value)) return value.length > 0;
      return Boolean(String(value || "").trim());
    });

    if (!clean && !hasFilters) {
      store.set("searchResults", []);
      store.set("searchMeta", buildSearchMeta(null, 1));
      store.setError("search", "");
      return [];
    }

    const seq = ++searchSeq;
    store.setLoading("search", true);
    store.setError("search", "");
    try {
      const payload = await api.searchAnime(clean, page, 25, filters);
      if (seq !== searchSeq) return [];
      const rows = rowsFromPayload(payload);
      store.set("searchResults", rows);
      store.set("searchMeta", buildSearchMeta(payload, page));
      return rows;
    } catch {
      if (seq !== searchSeq) return [];
      store.setError("search", "Search failed. Please try again.");
      store.set("searchResults", []);
      store.set("searchMeta", buildSearchMeta(null, page));
      return [];
    } finally {
      if (seq !== searchSeq) return;
      store.setLoading("search", false);
    }
  }

  async function getAnimeDetail(malId) {
    return api.getAnimeDetail(malId);
  }

  async function loadLiveUpcoming(limit = 100) {
    store.setLoading("liveUpcoming", true);
    store.setError("liveUpcoming", "");
    try {
      const payload = await api.getLiveUpcoming(limit);
      const rows = Array.isArray(payload)
        ? payload
        : (Array.isArray(payload?.data) ? payload.data : []);
      const state = store.getState();
      const catalogRows = [
        ...(state.airing || []),
        ...(state.seasonal || []),
        ...(state.trending || []),
        ...(state.top || [])
      ];
      const catalog = new Map(catalogRows.map((item) => [Number(item?.malId || 0), item]));
      const normalized = rows
        .map((row) => normalizeLiveUpcomingRow(row, catalog))
        .filter(Boolean)
        .sort((left, right) => Number(left.releaseTimestamp || 0) - Number(right.releaseTimestamp || 0));
      store.set("liveUpcoming", normalized);
      return normalized;
    } catch {
      store.setError("liveUpcoming", "Live upcoming service unavailable.");
      store.set("liveUpcoming", []);
      return [];
    } finally {
      store.setLoading("liveUpcoming", false);
      if (liveUpcomingRefreshEnabled) refreshLiveUpcomingInterval();
    }
  }

  async function loadDashboardData() {
    const [seasonal, trending, top, airing] = await Promise.all([
      loadSeasonal(),
      loadTrending(),
      loadTop(),
      loadAiring()
    ]);
    return { seasonal, trending, top, airing };
  }

  function startAiringRefresh(intervalMs = 10 * 60 * 1000, options = {}) {
    stopAiringRefresh();
    const allowLowInterval = Boolean(options.allowLowInterval);
    const floorMs = allowLowInterval ? 100 : 60_000;
    const everyMs = Math.max(floorMs, Number(intervalMs) || (10 * 60 * 1000));
    refreshTimer = window.setInterval(() => { void loadAiring(); }, everyMs);
  }

  function stopAiringRefresh() {
    if (!refreshTimer) return;
    clearInterval(refreshTimer);
    refreshTimer = 0;
  }

  function computeLiveUpcomingRefreshMs(fallbackMs = 60_000) {
    const state = store.getState();
    const now = Date.now();
    const nearest = [...(state?.liveUpcoming || [])]
      .map((item) => Number(item?.releaseTimestamp || 0))
      .filter((ts) => ts > now)
      .sort((a, b) => a - b)[0];
    if (!nearest) return Math.max(10_000, Number(fallbackMs) || 60_000);

    const deltaMs = nearest - now;
    if (deltaMs < ONE_HOUR_MS) return LIVE_REFRESH_SHORT_MS;
    if (deltaMs < SIX_HOURS_MS) return LIVE_REFRESH_MEDIUM_MS;
    return LIVE_REFRESH_LONG_MS;
  }

  function refreshLiveUpcomingInterval() {
    if (!liveUpcomingRefreshEnabled) return;
    const nextMs = computeLiveUpcomingRefreshMs(liveUpcomingFallbackMs);
    if (liveUpcomingTimer && liveUpcomingIntervalMs === nextMs) return;
    if (liveUpcomingTimer) clearInterval(liveUpcomingTimer);
    liveUpcomingIntervalMs = nextMs;
    liveUpcomingTimer = window.setInterval(() => { void loadLiveUpcoming(); }, nextMs);
  }

  function startLiveUpcomingRefresh(intervalMs = 60 * 1000) {
    liveUpcomingRefreshEnabled = true;
    liveUpcomingFallbackMs = Math.max(10_000, Number(intervalMs) || 60_000);
    refreshLiveUpcomingInterval();
  }

  function stopLiveUpcomingRefresh() {
    liveUpcomingRefreshEnabled = false;
    if (!liveUpcomingTimer) return;
    clearInterval(liveUpcomingTimer);
    liveUpcomingTimer = 0;
    liveUpcomingIntervalMs = 0;
  }

  let refreshTimer = 0;
  let liveUpcomingTimer = 0;
  let liveUpcomingIntervalMs = 0;
  let liveUpcomingRefreshEnabled = false;
  let liveUpcomingFallbackMs = 60_000;

  return Object.freeze({
    loadAiring,
    loadTrending,
    loadSeasonal,
    loadTop,
    performSearch,
    getAnimeDetail,
    loadLiveUpcoming,
    loadDashboardData,
    startAiringRefresh,
    stopAiringRefresh,
    startLiveUpcomingRefresh,
    stopLiveUpcomingRefresh
  });
}

// bindNavigation, openView, and initSectionReveal are now in:
// public/src/core/navigation.js and public/src/core/sectionReveal.js

function initDebugDiagnosticsPanel({ api, store, libraryStore, timers = globalThis }) {
  const card = document.createElement("aside");
  card.setAttribute("aria-live", "polite");
  card.style.position = "fixed";
  card.style.right = "14px";
  card.style.bottom = "14px";
  card.style.zIndex = "9999";
  card.style.width = "260px";
  card.style.maxWidth = "90vw";
  card.style.padding = "10px 12px";
  card.style.borderRadius = "10px";
  card.style.border = "1px solid var(--border-glass)";
  card.style.background = "var(--bg-card)";
  card.style.color = "var(--text-primary)";
  card.style.font = "12px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  card.style.backdropFilter = "blur(12px)";
  card.style.boxShadow = "0 12px 28px rgba(0,0,0,0.45)";
  card.style.pointerEvents = "none";
  card.innerHTML = "<strong style='display:block;margin-bottom:6px;'>Debug Diagnostics</strong><pre style='margin:0;white-space:pre-wrap;word-break:break-word;'>Initializing…</pre>";

  const pre = card.querySelector("pre");
  document.body.appendChild(card);

  let rafId = 0;
  let frameCount = 0;
  let lastFpsMark = performance.now();
  let fpsAverage = 0;
  let fpsSamples = 0;

  function fpsTick(timestamp) {
    frameCount += 1;
    const elapsed = timestamp - lastFpsMark;
    if (elapsed >= 1000) {
      const currentFps = (frameCount * 1000) / elapsed;
      fpsAverage = ((fpsAverage * fpsSamples) + currentFps) / (fpsSamples + 1);
      fpsSamples += 1;
      frameCount = 0;
      lastFpsMark = timestamp;
    }
    rafId = timers.requestAnimationFrame(fpsTick);
  }

  function readUsedHeapMb() {
    const used = Number(timers?.performance?.memory?.usedJSHeapSize || 0);
    if (!used) return "N/A";
    return `${(used / (1024 * 1024)).toFixed(1)} MB`;
  }

  function renderSnapshot() {
    const diagnostics = api?.getDiagnostics?.() || {};
    const state = store?.getState?.() || {};
    const airingSize = Array.isArray(state?.airing) ? state.airing.length : 0;
    const librarySize = Array.isArray(libraryStore?.getAll?.()) ? libraryStore.getAll().length : 0;
    const fpsText = fpsSamples ? `${fpsAverage.toFixed(1)} fps` : "Sampling…";

    if (pre) {
      pre.textContent = [
        `requests: ${Number(diagnostics.requestCount || 0)}`,
        `failures: ${Number(diagnostics.failureCount || 0)}`,
        `retries: ${Number(diagnostics.retryCount || 0)}`,
        `fps(avg): ${fpsText}`,
        `memory: ${readUsedHeapMb()}`,
        `airing: ${airingSize}`,
        `library: ${librarySize}`
      ].join("\n");
    }
  }

  rafId = timers.requestAnimationFrame(fpsTick);
  renderSnapshot();
  const intervalId = timers.setInterval(renderSnapshot, 2000);

  return Object.freeze({
    destroy() {
      if (intervalId) timers.clearInterval(intervalId);
      if (rafId) timers.cancelAnimationFrame(rafId);
      card.remove();
    }
  });
}

async function bootstrap() {
  const params = new URLSearchParams(globalThis.location?.search || "");
  // Debug panel only on explicit ?debug=1 — NOT auto-enabled on localhost
  const debugModeEnabled = (
    params.get("debug") === "1"
    || globalThis.Animyx_DEBUG === true
  );

  const api = createApiClient({
    liveUpcomingEndpoint: globalThis.Animyx_LIVE_UPCOMING_ENDPOINT || "/api/upcoming/live"
  });
  const store = createDataStore({}, { debug: debugModeEnabled });
  const libraryStore = createLibraryStore();
  globalThis.Animyx_LIBRARY_STORE = libraryStore;
  const controller = createDataController({ api, store });
  const ui = initUI();
  const toast = ui.toast;
  const theme = ui.theme;
  const libraryUI = initLibraryUI({ controller, libraryStore, toast });
  const modal = libraryUI.animeModal;
  const dashboardModules = initDashboardModules({
    store,
    libraryStore,
    controller,
    selectors,
    toast,
    onViewDetails: async (anime) => {
      await modal.open(anime?.malId, anime || null);
    }
  });

  bindNavigation();
  libraryStore.init([]);

  // Sync status indicator wiring (green = synced, yellow = syncing, red = offline)
  const syncIndicator = document.getElementById('sync-indicator');
  const syncText = document.getElementById('sync-text');
  const applySyncState = (state, detail = null) => {
    if (!syncIndicator) return;
    const value = String(state || 'synced');
    syncIndicator.setAttribute('data-state', value);
    if (syncText) {
      const queued = Boolean(detail?.queued);
      syncText.textContent =
        value === 'offline' ? (queued ? 'Offline (Queued)' : 'Offline')
          : value === 'syncing' ? 'Syncing'
            : value === 'error' ? 'Sync Error'
              : 'Synced';
    }

    const lastSyncedAt = Number(detail?.lastSyncedAt || 0) || 0;
    const retryInMs = Number(detail?.retryInMs || 0) || 0;
    const parts = [];
    if (value === 'error' && detail?.message) parts.push(String(detail.message));
    if (lastSyncedAt) parts.push(`Last sync: ${new Date(lastSyncedAt).toLocaleString()}`);
    if (retryInMs) parts.push(`Retry in: ${Math.ceil(retryInMs / 1000)}s`);
    syncIndicator.title = parts.length ? parts.join(' • ') : 'Sync status';
  };
  window.addEventListener('Animyx:sync-status', (e) => applySyncState(e?.detail?.state, e?.detail), { passive: true });
  applySyncState(navigator.onLine ? 'synced' : 'offline');

  const cloudSync = initLibraryCloudSync({ libraryStore, toast, syncIntervalMs: 120000 });

  const syncNowBtn = document.getElementById('sync-now-btn');
  if (syncNowBtn) {
    syncNowBtn.addEventListener('click', async () => {
      try {
        applySyncState('syncing');
        await cloudSync.syncNow();
      } catch (err) {
        console.warn('[Animyx] Manual sync failed:', err);
        toast?.show?.('Sync failed. Please try again.', 'error', 2200);
      }
    }, { passive: true });
  }

  const modules = [
    toast,
    theme,
    ui.chartTooltips,
    libraryUI,
    dashboardModules,
    initInsights({ libraryStore }),
    cloudSync,
    initSectionReveal(),
    initImageBlurUp() // Premium image blur-up effect on lazy load
  ];

  // ── My Journey Milestones ─────────────────────────────────────────────────
  const milestones = initMilestones({ libraryStore });
  modules.push(milestones);

  // ── My Tracker Feed ───────────────────────────────────────────────────────
  const trackerFeed = initTrackerFeed({ libraryStore, milestones });
  modules.push(trackerFeed);

  // Expose addEvent for socket notifications (from main.js / socket module)
  globalThis._AnimyxTrackerFeed = trackerFeed;

  modules.push(
    initSearchAdvanced({
      store,
      controller,
      libraryStore,
      selectors,
      toast,
      navigateToView: openView
    }),
    initSeasonBrowser({
      controller,
      libraryStore,
      toast,
      api,
      modal
    }),
    initProfile({ toast, libraryStore }),
    initSettings({ toast, libraryStore }),
    initExport({ libraryStore, toast }),
    initImport({ libraryStore, toast })
  );

  // ── SyncService initialization ─────────────────────────────────────────────
  const user = getState('currentUser');
  if (user?.id) {
    try {
      await syncService.init({ libraryStore });
    } catch (err) {
      console.warn('[Animyx] SyncService initialization failed:', err);
    }
  }

  await controller.loadDashboardData();
  controller.startAiringRefresh();

  if (params.get("debug") === "1") {
    modules.push(initDebugDiagnosticsPanel({ api, store, libraryStore }));
  }

  window.addEventListener("beforeunload", () => {
    controller.stopAiringRefresh();
    modules.forEach((mod) => mod?.destroy?.());
  }, { once: true });
}

export function startApp() {
  const init = async () => {
    await (window.__Animyx_AUTH_READY || Promise.resolve());
    await bootstrap();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
}
