import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

// ---------------------------------------------------------------------------
// Client ID (previously core/clientId.js)
// ---------------------------------------------------------------------------

const CLIENT_ID_STORAGE_KEY = 'Animyx:clientId';

function fallbackUuid() {
  const rnd = () => Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
  return `${rnd()}-${rnd().slice(0, 4)}-${rnd().slice(0, 4)}-${rnd().slice(0, 4)}-${rnd()}${rnd().slice(0, 4)}`;
}

export function getClientId() {
  try {
    const existing = localStorage.getItem(CLIENT_ID_STORAGE_KEY);
    if (existing) return existing;
    const next = (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function')
      ? globalThis.crypto.randomUUID()
      : fallbackUuid();
    localStorage.setItem(CLIENT_ID_STORAGE_KEY, next);
    return next;
  } catch {
    // If storage is blocked, still return a stable-ish id for this session.
    return (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function')
      ? globalThis.crypto.randomUUID()
      : fallbackUuid();
  }
}

// ---------------------------------------------------------------------------
// Supabase client (previously core/supabaseClient.js)
// ---------------------------------------------------------------------------

let client;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('[Animyx] Missing Supabase runtime config. Authentication and cloud sync will be disabled.');

  const dummyAuth = new Proxy({}, {
    get: (_target, prop) => {
      if (prop === 'onAuthStateChange') return () => ({ data: { subscription: { unsubscribe: () => {} } } });
      return async () => ({ data: null, error: new Error('Supabase not configured') });
    }
  });

  client = new Proxy({ auth: dummyAuth }, {
    get: (target, prop) => {
      if (prop === 'auth') return target.auth;
      return () => ({ data: null, error: new Error('Supabase not configured') });
    }
  });
} else {
  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

export const supabase = client;

// ---------------------------------------------------------------------------
// Navigation (previously core/navigation.js)
// ---------------------------------------------------------------------------

function normalizeViewTarget(viewId) {
  const targetId = String(viewId || "");
  if (targetId === "library-view") return "watchlist-view";
  return targetId;
}

function setSidebarOpen(isOpen) {
  document.body.classList.toggle("sidebar-open", Boolean(isOpen));
  const toggleBtn = document.querySelector("[data-sidebar-toggle]");
  if (toggleBtn) {
    toggleBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
  }
}

function closeSidebarForMobile() {
  if (window.matchMedia("(max-width: 1023px)").matches) {
    setSidebarOpen(false);
  }
}

function activateView(targetId) {
  if (!targetId) return;
  const navItems = document.querySelectorAll(".nav-item");
  const sections = document.querySelectorAll(".view-section");
  navItems.forEach((item) => item.classList.toggle("active", item.getAttribute("data-target") === targetId));
  sections.forEach((section) => section.classList.toggle("active", section.id === targetId));
  const scrollContainer = document.querySelector(".page-content") || document.querySelector(".view-container") || document.querySelector(".main-viewport");
  scrollContainer?.scrollTo({ top: 0, behavior: "smooth" });
}

export function bindNavigation() {
  const navItems = document.querySelectorAll(".nav-item");
  navItems.forEach((item) => {
    item.addEventListener("click", (event) => {
      event.preventDefault();
      const targetId = normalizeViewTarget(item.getAttribute("data-target"));
      if (!targetId) return;
      activateView(targetId);
      closeSidebarForMobile();
    });
  });

  document.querySelector("[data-sidebar-toggle]")?.addEventListener("click", () => {
    setSidebarOpen(!document.body.classList.contains("sidebar-open"));
  });

  document.querySelectorAll("[data-sidebar-close]").forEach((element) => {
    element.addEventListener("click", () => {
      setSidebarOpen(false);
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setSidebarOpen(false);
    }
  });

  window.addEventListener("resize", () => {
    if (!window.matchMedia("(max-width: 1023px)").matches) {
      setSidebarOpen(false);
    }
  });
}

export function openView(viewId) {
  const targetId = normalizeViewTarget(viewId);
  if (!targetId) return;
  activateView(targetId);
  closeSidebarForMobile();
}

// ---------------------------------------------------------------------------
// Section reveal (previously core/sectionReveal.js)
// ---------------------------------------------------------------------------

export function initSectionReveal({
  root = document,
  selectors = ".card, .kpi-card, .insight-panel, .profile-hero-card, .profile-glass-card"
} = {}) {
  const nodes = new Set();
  const revealed = new WeakSet();
  const prefersReducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (prefersReducedMotion) return Object.freeze({ destroy() {} });

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const node = entry.target;
      if (!entry.isIntersecting || revealed.has(node)) return;
      node.classList.add("animyx-reveal-visible");
      revealed.add(node);
      observer.unobserve(node);
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });

  function registerNode(node) {
    if (!(node instanceof HTMLElement) || nodes.has(node)) return;
    if (node.classList.contains("Animyx-reveal-skip")) return;
    node.classList.add("animyx-reveal");
    nodes.add(node);
    observer.observe(node);
  }

  function registerAll() {
    root.querySelectorAll(selectors).forEach(registerNode);
  }

  const mutationObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((addedNode) => {
        if (!(addedNode instanceof HTMLElement)) return;
        if (addedNode.matches?.(selectors)) registerNode(addedNode);
        addedNode.querySelectorAll?.(selectors).forEach(registerNode);
      });
    });
  });

  registerAll();
  mutationObserver.observe(document.body, { childList: true, subtree: true });

  return Object.freeze({
    destroy() {
      mutationObserver.disconnect();
      observer.disconnect();
      nodes.clear();
    }
  });
}

// ---------------------------------------------------------------------------
// Data normalization (previously core/dataNormalize.js)
// ---------------------------------------------------------------------------

export function resolveEpisodes(rawEpisodes, rawStatus = "") {
  const n = Number(rawEpisodes);
  if (Number.isFinite(n) && n > 0) return n;
  const status = String(rawStatus || "").toLowerCase();
  if (status.includes("airing") || status.includes("ongoing")) return "Ongoing";
  return "Unknown";
}

export function resolveEpisodesNumeric(rawEpisodes) {
  const n = Number(rawEpisodes);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function normalizeTitle(title) {
  if (typeof title !== "string") return "";
  let cleaned = title.replace(/\s+/g, " ").trim();
  cleaned = cleaned.replace(/\s*[-:]\s*Part\s+\d+\s*$/i, "");
  cleaned = cleaned.replace(/\s+Part\s+\d+\s*$/i, "");
  cleaned = cleaned.replace(/\s*[-:]\s*$/g, "").trim();
  return cleaned;
}

export function getDisplayTitle(anime) {
  const titles = Array.isArray(anime?.titles) ? anime.titles : [];
  const findByType = (type) => titles.find((t) => String(t?.type || "").toLowerCase() === type)?.title || "";

  const candidates = [
    anime?.title_english,
    findByType("english"),
    anime?.title, // romaji/default
    findByType("default"),
    anime?.title_japanese,
    findByType("japanese")
  ];

  for (const candidate of candidates) {
    const normalized = normalizeTitle(candidate);
    if (normalized) return normalized;
  }
  return "Unknown Title";
}

export function normalizeAnime(item) {
  const ratingRaw = String(item?.rating || "").toLowerCase();
  let ratingCategory = "";
  if (ratingRaw.includes("pg-13")) ratingCategory = "pg13";
  else if (ratingRaw.includes("r -") || ratingRaw.startsWith("r ")) ratingCategory = "r";
  else if (ratingRaw.includes("r+")) ratingCategory = "rplus";
  else if (ratingRaw.includes("rx")) ratingCategory = "rx";
  else if (ratingRaw.startsWith("pg")) ratingCategory = "pg";
  else if (ratingRaw.startsWith("g")) ratingCategory = "g";

  const episodesTotal = resolveEpisodesNumeric(item?.episodes);
  const episodesAiredRaw = Number(item?.episodes_aired || item?.released_episodes);
  const statusStr = String(item?.status || item?.airing_status || "").toLowerCase();
  const isFinished = statusStr.includes("finished");

  const episodesReleased = Number.isFinite(episodesAiredRaw)
    ? Math.max(0, episodesAiredRaw)
    : (isFinished ? episodesTotal : episodesTotal);

  return {
    malId: item?.mal_id || item?.id,
    title: getDisplayTitle(item),
    title_english: item?.title_english || "",
    titles: Array.isArray(item?.titles) ? item.titles : [],
    image: item?.poster || item?.images?.jpg?.large_image_url || item?.images?.jpg?.image_url || "",
    poster: item?.poster || item?.images?.jpg?.large_image_url || "",
    score: typeof item?.score === "number" ? item.score : 0,
    year: item?.year || item?.aired?.prop?.from?.year || 0,
    episodes: episodesTotal,
    total_episodes: episodesTotal,
    released_episodes: episodesReleased,
    episodesReleased,
    next_episode: item.next_episode || null,
    next_airing: item.next_airing || null,
    airing_status: statusStr,
    airing_day: item.airing_day || (item?.broadcast?.day ? item.broadcast.day.toLowerCase() : ""),
    duration: item?.duration || "",
    type: String(item?.type || "").toLowerCase(),
    season: String(item?.season || "").toLowerCase(),
    status: statusStr,
    genres: (item?.genres || []).map((genre) => (typeof genre === 'string' ? genre : genre.name)),
    studio: item?.studios?.[0]?.name || item.studio || "",
    ratingCategory,
    language: (item?.title_english || item.title_english) ? "english" : "japanese",
    popularity: item?.popularity || 999999,
    broadcastDay: item?.broadcast?.day ? item.broadcast.day.toLowerCase() : "",
    broadcastTime: item?.broadcast?.time || "",
    broadcastString: item?.broadcast?.string || ""
  };
}

export function dedupeAnimeList(list) {
  const byKey = new Map();
  for (const item of list) {
    if (!item) continue;
    const key = item.malId || `${normalizeTitle(item.title).toLowerCase()}_${item.season || ""}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, item);
      continue;
    }
    // prefer better image and higher score
    const hasBetterImage = (candidate) => typeof candidate?.image === "string" && candidate.image.length > 10;
    const chosen = { ...existing };
    if (!hasBetterImage(existing) && hasBetterImage(item)) chosen.image = item.image;
    if ((item.score || 0) > (existing.score || 0)) chosen.score = item.score;
    if ((item.episodesReleased || 0) > (existing.episodesReleased || 0)) chosen.episodesReleased = item.episodesReleased;
    if ((item.episodes || 0) > (existing.episodes || 0)) chosen.episodes = item.episodes;
    if (item.title && existing.title === "Unknown Title") chosen.title = item.title;
    byKey.set(key, chosen);
  }
  return Array.from(byKey.values());
}

// ---------------------------------------------------------------------------
// Client data cleanup (previously core/clearClientData.js)
// ---------------------------------------------------------------------------

const USER_SCOPED_LOCALSTORAGE_KEYS = [
  // Library & user objects
  'Animyx_library_v3',
  'Animyx_profile_v1',
  'Animyx_settings_v1',

  // Dashboard caches / misc
  'Animyx_live_news_cache_v1',
  'Animyx_fav_clip',
  'Animyx_dashboard_upcoming_v1',
  'Animyx_notif_cache_v1',
  'Animyx_tracker_notifs_v1'
];

const USER_SCOPED_SESSIONSTORAGE_KEYS = [
  'Animyx:redirectLock'
];

const LOCALSTORAGE_PREFIXES = [
  // API cache module
  'Animyx_v3_cache_'
];

const INDEXEDDB_DATABASES = [
  // cloudSync offline KV
  'Animyx_sync_v1'
];

function safeRemoveStorageKey(storage, key) {
  try { storage?.removeItem?.(key); } catch (_) {}
}

function safeIterateKeys(storage, cb) {
  try {
    const keys = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k) keys.push(k);
    }
    keys.forEach(cb);
  } catch (_) {}
}

function looksLikeSupabaseAuthKey(key) {
  // Typical key: sb-<projectRef>-auth-token
  if (/^sb-[a-z0-9]+-auth-token$/i.test(String(key))) return true;
  // Older / alternative keys sometimes used by GoTrue clients.
  if (String(key).toLowerCase().includes('supabase.auth')) return true;
  return false;
}

export async function clearAnimyxUserData({ keepPreferences = true } = {}) {
  // keepPreferences=true keeps theme/accent, but clears library/profile/sync caches.
  for (const key of USER_SCOPED_LOCALSTORAGE_KEYS) safeRemoveStorageKey(localStorage, key);
  for (const key of USER_SCOPED_SESSIONSTORAGE_KEYS) safeRemoveStorageKey(sessionStorage, key);

  safeIterateKeys(localStorage, (key) => {
    for (const prefix of LOCALSTORAGE_PREFIXES) {
      if (String(key).startsWith(prefix)) safeRemoveStorageKey(localStorage, key);
    }
    // Clear store-level persisted keys, except preferences if requested.
    if (String(key).startsWith('Animyx:')) {
      const suffix = String(key).slice('Animyx:'.length);
      const isPreference = (suffix === 'theme' || suffix === 'accentColor');
      if (keepPreferences && isPreference) return;
      safeRemoveStorageKey(localStorage, key);
    }
  });

  // IndexedDB: clear offline sync KV (best-effort)
  if (typeof indexedDB !== 'undefined' && indexedDB?.deleteDatabase) {
    await Promise.allSettled(
      INDEXEDDB_DATABASES.map((name) => new Promise((resolve) => {
        try {
          const req = indexedDB.deleteDatabase(name);
          req.onsuccess = () => resolve();
          req.onerror = () => resolve();
          req.onblocked = () => resolve();
        } catch {
          resolve();
        }
      }))
    );
  }
}

export async function clearAnimyxAllData() {
  await clearAnimyxUserData({ keepPreferences: false });

  // Also remove Supabase auth keys so deleted users don't keep cached sessions.
  safeIterateKeys(localStorage, (key) => {
    if (looksLikeSupabaseAuthKey(key)) safeRemoveStorageKey(localStorage, key);
  });

  // Clear Cache Storage & unregister SW to avoid stale builds.
  if (typeof caches !== 'undefined' && caches?.keys) {
    try {
      const keys = await caches.keys();
      await Promise.allSettled(keys.map((k) => caches.delete(k)));
    } catch (_) {}
  }

  if (navigator?.serviceWorker?.getRegistrations) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.allSettled(regs.map((r) => r.unregister()));
    } catch (_) {}
  }
}
