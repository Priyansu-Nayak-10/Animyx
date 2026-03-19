import { apiUrl, authFetch } from '../../config.js';
import { setState } from '../../store.js';
import { supabase } from '../../core/utils.js';
import { clearAnimyxAllData } from '../../core/utils.js';
const PROFILE_STORAGE_KEY = "Animyx_profile_v1";
const SETTINGS_STORAGE_KEY = "Animyx_settings_v1";
const DEFAULT_AVATAR_URL =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuCZIUjpzoTljfbNTeGmRQKuBDx6E6cXNLOTQbK6rcfrP_rs28dFFZ75JwW4sHvRfNIXCQc9oUfnfUraGWQWCNuMpLg5D2L37XNwpH3vBzWdVdBQanEdpvD-o464S-lnVRcvaM__u2qTA1s9j87J6fYLrhu7SMz0cf6qEoJ4fnGyjwEAFwueD6Br16uNo4kVoV9Kh9GHeA3UHfbKyQ-0rzPbPXVM609W9FDgusNOamiiZFmIO95W5FQhieq_6J8-_ccpUMoAvbOSgn05";

// ──────────────────────────────────────────────────
//  RANK / LEVEL SYSTEM
// ──────────────────────────────────────────────────
const RANKS = [
  { min: 0, label: "Anime Newcomer", level: 1 },
  { min: 5, label: "Casual Viewer", level: 2 },
  { min: 15, label: "Series Devotee", level: 3 },
  { min: 30, label: "Genre Explorer", level: 4 },
  { min: 50, label: "Binge Warrior", level: 5 },
  { min: 75, label: "Arc Conqueror", level: 6 },
  { min: 100, label: "Season Veteran", level: 7 },
  { min: 150, label: "Elite Otaku", level: 8 },
  { min: 200, label: "Legendary Watcher", level: 9 },
  { min: 300, label: "Anime Deity", level: 10 }
];

function getRank(totalWatched) {
  let rank = RANKS[0];
  for (const r of RANKS) {
    if (totalWatched >= r.min) rank = r;
  }
  return rank;
}

// ──────────────────────────────────────────────────
//  STREAK CALCULATION (days of consecutive activity)
// ──────────────────────────────────────────────────
function computeStreak(libraryStore) {
  const all = libraryStore?.getAll?.() || [];
  const days = new Set();
  for (const item of all) {
    if (item.updatedAt) {
      const d = new Date(item.updatedAt).toDateString();
      days.add(d);
    }
  }
  if (!days.size) return 0;
  let streak = 0;
  const today = new Date();
  let cursor = new Date(today);
  while (days.has(cursor.toDateString())) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// ──────────────────────────────────────────────────
//  TOP GENRE CALCULATION
// ──────────────────────────────────────────────────
function getTopGenre(libraryStore) {
  const all = libraryStore?.getAll?.() || [];
  const counts = {};
  for (const item of all) {
    for (const g of (item.genres || [])) {
      counts[g] = (counts[g] || 0) + 1;
    }
  }
  let best = null, bestCount = 0;
  for (const [g, c] of Object.entries(counts)) {
    if (c > bestCount) { bestCount = c; best = g; }
  }
  return best;
}

// ──────────────────────────────────────────────────
//  STORAGE / CLOUD SYNC HELPERS
// ──────────────────────────────────────────────────
function getUserId() {
  try {
    const rawUser = globalThis.localStorage?.getItem('Animyx:currentUser');
    if (rawUser) {
      const u = JSON.parse(rawUser);
      if (u && u.id) return u.id;
    }
  } catch (_) { }
  return null;
}

async function fetchCloudProfile(storage) {
  const uid = getUserId();
  if (!uid) return;
  try {
    const res = await authFetch(apiUrl('/users/me/profile'));
    if (res.ok) {
      const { data } = await res.json();
      if (data && Object.keys(data).length > 0) {
        storage?.setItem?.(PROFILE_STORAGE_KEY, JSON.stringify(data));
      }
    }
  } catch (err) { console.warn("Profile sync failed", err); }
}

function readProfile(storage) {
  try {
    const rawUser = globalThis.localStorage?.getItem('Animyx:currentUser');
    const sessionUser = rawUser ? JSON.parse(rawUser) : {};

    const rawProfile = storage?.getItem?.(PROFILE_STORAGE_KEY);
    const localProfile = rawProfile ? JSON.parse(rawProfile) : {};

    // Fallback order: Local Profile Storage -> Supabase Session Identity -> Blank
    return {
      name: localProfile.name || sessionUser.user_metadata?.full_name || sessionUser.user_metadata?.name || "",
      bio: localProfile.bio || "",
      mal: localProfile.mal || "",
      al: localProfile.al || "",
      avatar: localProfile.avatar || sessionUser.user_metadata?.avatar_url || "",
      banner: localProfile.banner || ""
    };
  } catch { return {}; }
}

async function writeProfile(storage, data) {
  try { storage?.setItem?.(PROFILE_STORAGE_KEY, JSON.stringify(data)); } catch { }

  const uid = getUserId();
  if (!uid) return;
  try {
    await authFetch(apiUrl('/users/me/profile'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  } catch (err) { console.warn("Profile cloud save failed", err); }
}

// ──────────────────────────────────────────────────
//  PAGE-WIDE HELPERS
// ──────────────────────────────────────────────────
function applyAvatarToPage(src) {
  const headerImg = document.getElementById("header-profile-img");
  const profileImg = document.getElementById("profile-avatar-img");
  const s = src || DEFAULT_AVATAR_URL;
  if (headerImg) headerImg.src = s;
  if (profileImg) profileImg.src = s;
}

function applyUsernameToPage(name) {
  ["header-username", "profile-display-name"].forEach(id => {
    const el = document.getElementById(id);
    if (el && name) el.textContent = name;
  });
}

function applyBannerToPage(src) {
  const banner = document.getElementById("profile-banner");
  if (!banner) return;
  if (src) {
    banner.style.backgroundImage = `url('${src}')`;
    banner.style.backgroundSize = "cover";
    banner.style.backgroundPosition = "center";
  } else {
    banner.style.backgroundImage = "";
  }
}

function applyAccentColor(color) {
  if (!color) return;
  const root = document.documentElement;
  root.style.setProperty("--brand-primary", color);
  root.style.setProperty("--brand-secondary", color); // fallback to same for simplicity
  root.style.setProperty("--brand-accent", color);
  root.style.setProperty("--brand-glow", color);
  root.style.setProperty("--accent", color); // legacy/shared
  root.style.setProperty("--primary", color); // legacy internal
  root.style.setProperty("--chart-purple", color); // Make charts follow accent
}

// ──────────────────────────────────────────────────
//  PROFILE FEATURE
// ──────────────────────────────────────────────────
function initProfile({ toast, libraryStore, storage = globalThis.localStorage } = {}) {
  const refs = {
    nameInput: document.getElementById("profile-name-input"),
    bioInput: document.getElementById("profile-bio-input"),
    malInput: document.getElementById("profile-mal-input"),
    alInput: document.getElementById("profile-al-input"),
    saveBtn: document.getElementById("save-profile-btn"),
    editAvatarBtn: document.getElementById("edit-avatar-btn"),
    avatarFile: document.getElementById("avatar-file-input"),
    editBannerBtn: document.getElementById("edit-banner-btn"),
    bannerFile: document.getElementById("banner-file-input"),
    levelText: document.getElementById("profile-level-text"),
    rankLabel: document.getElementById("profile-rank-label"),
    streakCount: document.getElementById("profile-streak-count"),
    pstatWatched: document.getElementById("pstat-watched"),
    pstatHours: document.getElementById("pstat-hours"),
    pstatGenre: document.getElementById("pstat-genre"),
    pstatCompletion: document.getElementById("pstat-completion")
  };

  function renderStats() {
    const all = libraryStore?.getAll?.() || [];
    const completed = all.filter(i => i.status === "completed");
    const total = all.length;
    const pct = total ? Math.round((completed.length / total) * 100) : 0;

    // Total episodes × avg 24 min per episode → hours
    const episodes = all.reduce((s, i) => s + (Number(i.progress) || 0), 0);
    const hours = Math.round(episodes * 24 / 60);

    const topGenre = getTopGenre(libraryStore) || "—";
    const rank = getRank(completed.length);
    const streak = computeStreak(libraryStore);

    if (refs.pstatWatched) refs.pstatWatched.textContent = total;
    if (refs.pstatHours) refs.pstatHours.textContent = `${hours}h`;
    if (refs.pstatGenre) refs.pstatGenre.textContent = topGenre;
    if (refs.pstatCompletion) refs.pstatCompletion.textContent = `${pct}%`;
    if (refs.levelText) refs.levelText.textContent = `Level ${rank.level}`;
    if (refs.rankLabel) refs.rankLabel.textContent = rank.label;
    if (refs.streakCount) refs.streakCount.textContent = streak;
  }

  function render() {
    const profile = readProfile(storage);
    if (refs.nameInput && profile.name) refs.nameInput.value = profile.name;
    if (refs.bioInput && profile.bio) refs.bioInput.value = profile.bio;
    if (refs.malInput && profile.mal) refs.malInput.value = profile.mal;
    if (refs.alInput && profile.al) refs.alInput.value = profile.al;
    if (profile.avatar) applyAvatarToPage(profile.avatar);
    if (profile.banner) applyBannerToPage(profile.banner);
    if (profile.name) applyUsernameToPage(profile.name);
    renderStats();
  }

  // Auto-sync on init
  fetchCloudProfile(storage).then(() => render());

  // Listen for real-time sync events
  window.addEventListener('Animyx:profile-sync', () => {
    render();
  });

  function onSave() {
    const profile = readProfile(storage);
    const name = String(refs.nameInput?.value || "").trim();
    const bio = String(refs.bioInput?.value || "").trim();
    const mal = String(refs.malInput?.value || "").trim();
    const al = String(refs.alInput?.value || "").trim();
    writeProfile(storage, { ...profile, name: name || profile.name, bio, mal, al });
    if (name) applyUsernameToPage(name);
    toast?.show?.("Profile saved successfully! ✓");
  }

  function onAvatarChange(event) {
    const file = event.target?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result || "");
      if (!src) return;
      writeProfile(storage, { ...readProfile(storage), avatar: src });
      applyAvatarToPage(src);
      toast?.show?.("Avatar updated! ✓");
    };
    reader.readAsDataURL(file);
  }

  function onBannerChange(event) {
    const file = event.target?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result || "");
      if (!src) return;
      writeProfile(storage, { ...readProfile(storage), banner: src });
      applyBannerToPage(src);
      toast?.show?.("Banner updated! ✓");
    };
    reader.readAsDataURL(file);
  }

  refs.saveBtn?.addEventListener("click", onSave);
  refs.editAvatarBtn?.addEventListener("click", () => refs.avatarFile?.click());
  refs.avatarFile?.addEventListener("change", onAvatarChange);
  refs.editBannerBtn?.addEventListener("click", () => refs.bannerFile?.click());
  refs.bannerFile?.addEventListener("change", onBannerChange);

  render();

  return Object.freeze({ render, destroy() { } });
}

// ──────────────────────────────────────────────────
//  SETTINGS FEATURE
// ──────────────────────────────────────────────────

// Helper: convert base64 vapid key to Uint8Array
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

const DEFAULT_SETTINGS = Object.freeze({
  darkTheme: true,
  notifications: false,
  autoplay: false,
  dataSaver: false,
  titleLang: "english",
  defaultStatus: "plan",
  accentColor: "#8b5cf6"
});

const PURPLE_ACCENT_SWATCHES = Object.freeze([
  "#8b5cf6",
  "#7c3aed",
  "#6d28d9",
  "#a78bfa",
  "#c4b5fd",
  "#9333ea",
  "#7e22ce",
  "#581c87"
]);

function normalizeAccentColor(color) {
  const normalized = String(color || "").trim().toLowerCase();
  return PURPLE_ACCENT_SWATCHES.find((swatch) => swatch === normalized) || DEFAULT_SETTINGS.accentColor;
}

async function fetchCloudSettings(storage) {
  const uid = getUserId();
  if (!uid) return;
  try {
    const res = await authFetch(apiUrl('/users/me/settings'));
    if (res.ok) {
      const { data } = await res.json();
      if (data && Object.keys(data).length > 0) {
        // Map snake_case to camelCase
        const mapped = {
          darkTheme: data.dark_theme,
          notifications: data.notifications,
          autoplay: data.autoplay,
          dataSaver: data.data_saver,
          titleLang: data.title_lang,
          defaultStatus: data.default_status,
          accentColor: data.accent_color
        };
        storage?.setItem?.(SETTINGS_STORAGE_KEY, JSON.stringify(mapped));
      }
    }
  } catch (err) { console.warn("Settings sync failed", err); }
}

function readSettings(storage) {
  try {
    const raw = storage?.getItem?.(SETTINGS_STORAGE_KEY);
    const parsed = raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
    return { ...parsed, accentColor: normalizeAccentColor(parsed.accentColor) };
  } catch { return { ...DEFAULT_SETTINGS }; }
}

async function writeSettings(storage, data) {
  try { storage?.setItem?.(SETTINGS_STORAGE_KEY, JSON.stringify(data)); } catch { }

  const uid = getUserId();
  if (!uid) return;
  try {
    // Map camelCase back to snake_case for DB
    const mapped = {
      dark_theme: data.darkTheme,
      notifications: data.notifications,
      autoplay: data.autoplay,
      data_saver: data.dataSaver,
      title_lang: data.titleLang,
      default_status: data.defaultStatus,
      accent_color: normalizeAccentColor(data.accentColor)
    };
    await authFetch(apiUrl('/users/me/settings'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mapped)
    });
  } catch (err) { console.warn("Settings cloud save failed", err); }
}

function applyDarkTheme(enabled) {
  const isDark = Boolean(enabled);
  document.body.classList.toggle("dark", isDark);
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
}

function applyDataSaver(enabled) {
  if (enabled) document.body.setAttribute("data-saver", "true");
  else document.body.removeAttribute("data-saver");
}

function initSettings({ toast, libraryStore, storage = globalThis.localStorage } = {}) {
  const refs = {
    darkTheme: document.getElementById("setting-dark-theme"),
    notifications: document.getElementById("setting-notifications"),
    autoplay: document.getElementById("setting-autoplay"),
    dataSaver: document.getElementById("setting-data-saver"),
    titleLang: document.getElementById("setting-title-lang"),
    defaultStatus: document.getElementById("setting-default-status"),
    accentPicker: document.getElementById("accent-color-picker"),
    clearLibrary: document.getElementById("clear-library-btn"),
    resetLocal: document.getElementById("reset-local-data-btn"),
    deleteAccount: document.getElementById("delete-account-btn")
  };

  function render() {
    const s = readSettings(storage);
    if (refs.darkTheme) refs.darkTheme.checked = Boolean(s.darkTheme);
    if (refs.notifications) refs.notifications.checked = Boolean(s.notifications);
    if (refs.autoplay) refs.autoplay.checked = Boolean(s.autoplay);
    if (refs.dataSaver) refs.dataSaver.checked = Boolean(s.dataSaver);
    if (refs.titleLang) refs.titleLang.value = s.titleLang || "english";
    if (refs.defaultStatus) refs.defaultStatus.value = s.defaultStatus || "plan";
    applyDarkTheme(s.darkTheme);
    applyDataSaver(s.dataSaver);
    const accentColor = normalizeAccentColor(s.accentColor);
    applyAccentColor(accentColor);
    // Reflect active swatch
    refs.accentPicker?.querySelectorAll(".accent-swatch").forEach(sw => {
      sw.classList.toggle("active", sw.dataset.color === accentColor);
    });
  }

  // Auto-sync on init
  fetchCloudSettings(storage).then(() => render());

  // Listen for real-time sync events
  window.addEventListener('Animyx:settings-sync', () => {
    render();
  });

  function onDarkTheme(e) {
    const enabled = Boolean(e.target.checked);
    const theme = enabled ? 'dark' : 'light';
    writeSettings(storage, { ...readSettings(storage), darkTheme: enabled });
    setState({ theme });
    applyDarkTheme(enabled);
    toast?.show?.(enabled ? "Dark mode enabled" : "Light mode enabled");
  }

  async function onNotifications(e) {
    const enabled = Boolean(e.target.checked);

    if (enabled && "Notification" in window) {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        if (refs.notifications) refs.notifications.checked = false;
        toast?.show?.("Notification permission denied", "error");
        return;
      }

      try {
        // 1. Register Service Worker
        const swReg = await navigator.serviceWorker.register('/sw.js');

        // 2. Fetch VAPID public key
        const keyRes = await authFetch(apiUrl('/push/public-key'));
        const { publicKey } = await keyRes.json();

        // 3. Subscribe to Web Push
        const sub = await swReg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey)
        });

        // 4. Send subscription to backend
        await authFetch(apiUrl('/push/subscribe'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: sub })
        });

        toast?.show?.("Push notifications enabled ✓");
      } catch (err) {
        console.error("Push registration failed", err);
        if (refs.notifications) refs.notifications.checked = false;
        toast?.show?.("Failed to enable push notifications", "error");
        return;
      }
    } else if (!enabled && "serviceWorker" in navigator) {
      try {
        const swReg = await navigator.serviceWorker.ready;
        const sub = await swReg.pushManager.getSubscription();
        if (sub) {
          await sub.unsubscribe();
          await authFetch(apiUrl('/push/unsubscribe'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
          });
        }
        toast?.show?.("Push notifications disabled");
      } catch (err) {
        console.error("Push unsubscribe failed", err);
      }
    }

    writeSettings(storage, { ...readSettings(storage), notifications: enabled });
  }

  function onAutoplay(e) {
    const enabled = Boolean(e.target.checked);
    writeSettings(storage, { ...readSettings(storage), autoplay: enabled });
    toast?.show?.(enabled ? "Autoplay enabled" : "Autoplay disabled");
  }

  function onDataSaver(e) {
    const enabled = Boolean(e.target.checked);
    writeSettings(storage, { ...readSettings(storage), dataSaver: enabled });
    applyDataSaver(enabled);
    toast?.show?.(enabled ? "Data Saver on" : "Data Saver off");
  }

  function onTitleLang(e) {
    writeSettings(storage, { ...readSettings(storage), titleLang: e.target.value });
    toast?.show?.(`Title language set to ${e.target.options[e.target.selectedIndex].text}`);
  }

  function onDefaultStatus(e) {
    writeSettings(storage, { ...readSettings(storage), defaultStatus: e.target.value });
    toast?.show?.("Default status updated");
  }

  function onSwatchClick(e) {
    const swatch = e.target.closest(".accent-swatch");
    if (!swatch) return;
    const color = normalizeAccentColor(swatch.dataset.color);
    if (!color) return;
    writeSettings(storage, { ...readSettings(storage), accentColor: color });
    setState({ accentColor: color });
    applyAccentColor(color);
    refs.accentPicker?.querySelectorAll(".accent-swatch").forEach(sw => {
      sw.classList.toggle("active", sw === swatch);
    });
    toast?.show?.("Accent color updated ✓");
  }

  function onClearLibrary() {
    const confirmed = window.confirm(
      "WARNING: This will permanently delete your entire library (watchlist, completed, plan-to-watch). This cannot be undone.\n\nAre you sure?"
    );
    if (!confirmed) return;
    libraryStore.clear();
    toast?.show?.("Library cleared successfully.");
  }

  async function onResetLocal() {
    const confirmed = window.confirm(
      "Reset this device?\n\nThis will sign you out and clear cached data on this browser (library cache, offline sync DB, profile cache). Your cloud data will remain.\n\nContinue?"
    );
    if (!confirmed) return;

    try { await clearAnimyxAllData(); } catch (_) { }
    try { await supabase.auth.signOut(); } catch (_) { }
    window.location.replace('/pages/signin.html');
  }

  async function onDeleteAccount() {
    const confirmed = window.confirm(
      "DELETE ACCOUNT?\n\nThis permanently deletes your Animyx account and ALL synced data (library, profile, settings, notifications).\n\nThis cannot be undone.\n\nType OK in your head and click Cancel if unsure. Continue?"
    );
    if (!confirmed) return;

    try {
      const res = await authFetch(apiUrl('/users/me'), { method: 'DELETE' });
      if (!res.ok) {
        const msg = (await res.json().catch(() => null))?.message || 'Failed to delete account';
        toast?.show?.(msg, 'error');
        return;
      }
    } catch (err) {
      toast?.show?.(err?.message || 'Failed to delete account', 'error');
      return;
    }

    try { await clearAnimyxAllData(); } catch (_) { }
    try { await supabase.auth.signOut(); } catch (_) { }
    window.location.replace('/pages/signin.html');
  }

  refs.darkTheme?.addEventListener("change", onDarkTheme);
  refs.notifications?.addEventListener("change", onNotifications);
  refs.autoplay?.addEventListener("change", onAutoplay);
  refs.dataSaver?.addEventListener("change", onDataSaver);
  refs.titleLang?.addEventListener("change", onTitleLang);
  refs.defaultStatus?.addEventListener("change", onDefaultStatus);
  refs.accentPicker?.addEventListener("click", onSwatchClick);
  refs.clearLibrary?.addEventListener("click", onClearLibrary);
  refs.resetLocal?.addEventListener("click", onResetLocal);
  refs.deleteAccount?.addEventListener("click", onDeleteAccount);

  render();

  return Object.freeze({
    render,
    destroy() {
      refs.darkTheme?.removeEventListener("change", onDarkTheme);
      refs.notifications?.removeEventListener("change", onNotifications);
      refs.autoplay?.removeEventListener("change", onAutoplay);
      refs.dataSaver?.removeEventListener("change", onDataSaver);
      refs.titleLang?.removeEventListener("change", onTitleLang);
      refs.defaultStatus?.removeEventListener("change", onDefaultStatus);
      refs.accentPicker?.removeEventListener("click", onSwatchClick);
      refs.clearLibrary?.removeEventListener("click", onClearLibrary);
      refs.resetLocal?.removeEventListener("click", onResetLocal);
      refs.deleteAccount?.removeEventListener("click", onDeleteAccount);
    }
  });
}

// ──────────────────────────────────────────────────
//  EXPORT DATA FEATURE
// ──────────────────────────────────────────────────
function libraryItemToRow(item) {
  return {
    malId: item?.malId || 0,
    title: item?.title || "",
    status: item?.status || "",
    progress: item?.progress || 0,
    episodes: item?.episodes || 0,
    score: item?.score || 0,
    userRating: item?.userRating || "",
    genres: (item?.genres || []).join("; "),
    studio: item?.studio || "",
    year: item?.year || "",
    type: item?.type || "",
    completedAt: item?.completedAt ? new Date(item.completedAt).toISOString() : "",
    watchProgressAt: item?.watchProgressAt ? new Date(item.watchProgressAt).toISOString() : "",
    ratingUpdatedAt: item?.ratingUpdatedAt ? new Date(item.ratingUpdatedAt).toISOString() : "",
    watchlistAddedAt: item?.watchlistAddedAt ? new Date(item.watchlistAddedAt).toISOString() : "",
    updatedAt: item?.updatedAt ? new Date(item.updatedAt).toISOString() : ""
  };
}

function toCSV(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = v => {
    const s = String(v ?? "");
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    headers.join(","),
    ...rows.map(r => headers.map(h => escape(r[h])).join(","))
  ].join("\n");
}

function downloadBlob(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), {
    href: url, download: filename, style: "display:none"
  });
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
}

function initExport({ libraryStore, toast } = {}) {
  const refs = {
    jsonBtn: document.getElementById("export-format-json"),
    csvBtn: document.getElementById("export-format-csv"),
    generateBtn: document.getElementById("export-generate-btn"),
    total: document.getElementById("export-total"),
    completed: document.getElementById("export-completed"),
    watching: document.getElementById("export-watching"),
    planned: document.getElementById("export-plan")
  };

  let activeFormat = "json";

  function updatePreview() {
    const all = libraryStore?.getAll?.() || [];
    if (refs.total) refs.total.textContent = all.length;
    if (refs.completed) refs.completed.textContent = all.filter(i => i.status === "completed").length;
    if (refs.watching) refs.watching.textContent = all.filter(i => i.status === "watching").length;
    if (refs.planned) refs.planned.textContent = all.filter(i => i.status === "plan").length;
  }

  function setFormat(format) {
    activeFormat = format;
    [refs.jsonBtn, refs.csvBtn].forEach(btn => {
      if (!btn) return;
      btn.classList.toggle("active", btn.dataset.format === format);
    });
  }

  function onGenerate() {
    const items = libraryStore?.getAll?.() || [];
    if (!items.length) {
      toast?.show?.("Your library is empty — add some anime first!", "error");
      return;
    }
    const rows = items.map(libraryItemToRow);
    const now = new Date().toISOString().slice(0, 10);
    if (activeFormat === "csv") {
      downloadBlob(toCSV(rows), `Animyx-export-${now}.csv`, "text/csv;charset=utf-8;");
      toast?.show?.(`Downloaded ${items.length} entries as CSV ✓`);
    } else {
      const json = JSON.stringify({ exportedAt: new Date().toISOString(), count: items.length, library: items }, null, 2);
      downloadBlob(json, `Animyx-export-${now}.json`, "application/json");
      toast?.show?.(`Downloaded ${items.length} entries as JSON ✓`);
    }
  }

  refs.jsonBtn?.addEventListener("click", () => setFormat("json"));
  refs.csvBtn?.addEventListener("click", () => setFormat("csv"));
  refs.generateBtn?.addEventListener("click", onGenerate);

  setFormat("json");
  updatePreview();

  return Object.freeze({
    render() { updatePreview(); },
    destroy() {
      refs.jsonBtn?.removeEventListener("click", () => setFormat("json"));
      refs.csvBtn?.removeEventListener("click", () => setFormat("csv"));
      refs.generateBtn?.removeEventListener("click", onGenerate);
    }
  });
}

// ──────────────────────────────────────────────────
//  IMPORT DATA FEATURE (MAL XML)
// ──────────────────────────────────────────────────
function initImport({ libraryStore, toast } = {}) {
  const refs = {
    dropZone: document.getElementById("mal-drop-zone"),
    fileInput: document.getElementById("mal-file-input"),
    statusArea: document.getElementById("mal-upload-status"),
    fileName: document.getElementById("mal-file-name"),
    fileSize: document.getElementById("mal-file-size"),
    progressBar: document.getElementById("mal-progress-bar"),
    statusMsg: document.getElementById("mal-status-message"),
    importBtn: document.getElementById("mal-import-btn")
  };

  let selectedFile = null;

  function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024, dm = 2, sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  function handleFileSelection(file) {
    if (!file) return;

    const isXml = file.type === "text/xml" || file.type === "application/xml" || file.name.toLowerCase().endsWith(".xml");
    if (!isXml) {
      toast?.show?.("Only XML files are supported.", "error");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast?.show?.("File is too large. Maximum size is 10MB.", "error");
      return;
    }

    selectedFile = file;

    // Update UI
    if (refs.fileName) refs.fileName.textContent = file.name;
    if (refs.fileSize) refs.fileSize.textContent = formatBytes(file.size);
    if (refs.statusArea) {
      refs.statusArea.classList.remove("hidden");
      refs.statusArea.classList.remove("uploading");
    }
    if (refs.progressBar) {
      refs.progressBar.style.width = "0%";
      refs.progressBar.style.background = "#8b5cf6"; // Reset to purple
    }
    if (refs.statusMsg) {
      refs.statusMsg.textContent = "Ready to upload.";
      refs.statusMsg.style.color = "var(--text-muted)";
    }
    if (refs.importBtn) {
      refs.importBtn.disabled = false;
      refs.importBtn.innerHTML = '<span class="material-icons">cloud_upload</span> Start Import';
    }
  }

  // --- Drag & Drop Handlers ---
  function onDragOver(e) {
    e.preventDefault();
    refs.dropZone?.classList.add("dragover");
  }

  function onDragLeave(e) {
    e.preventDefault();
    refs.dropZone?.classList.remove("dragover");
  }

  function onDrop(e) {
    e.preventDefault();
    refs.dropZone?.classList.remove("dragover");
    if (e.dataTransfer?.files?.length) {
      handleFileSelection(e.dataTransfer.files[0]);
    }
  }

  // --- Click & Select Handlers ---
  refs.dropZone?.addEventListener("click", () => refs.fileInput?.click());
  refs.fileInput?.addEventListener("change", (e) => {
    if (e.target.files?.length) handleFileSelection(e.target.files[0]);
    // Reset input so same file selection triggers change again if needed
    e.target.value = "";
  });

  refs.dropZone?.addEventListener("dragover", onDragOver);
  refs.dropZone?.addEventListener("dragleave", onDragLeave);
  refs.dropZone?.addEventListener("drop", onDrop);

  // --- Upload Handler ---
  async function onImport() {
    if (!selectedFile) return;

    try {
      // 1. Setup UI for uploading
      if (refs.importBtn) {
        refs.importBtn.disabled = true;
        refs.importBtn.innerHTML = '<span class="material-icons animate-spin" style="margin-right: 8px;">sync</span> Importing...';
      }
      if (refs.statusArea) refs.statusArea.classList.add("uploading");
      if (refs.progressBar) {
        refs.progressBar.style.width = "40%"; // Fake initial progress
      }
      if (refs.statusMsg) refs.statusMsg.textContent = "Parsing and uploading your list... This may take a minute.";

      // 2. Prepare Form Data
      const formData = new FormData();
      formData.append("malExport", selectedFile);

      // 3. Send request
      const res = await authFetch(apiUrl("/import/mal"), {
        method: "POST",
        body: formData // Note: Omitting Content-Type header lets fetch set multipart boundary correctly
      });

      const json = await res.json();

      // 4. Handle response
      if (refs.statusArea) refs.statusArea.classList.remove("uploading");

      if (res.ok && json.success) {
        // Success UI
        if (refs.progressBar) {
          refs.progressBar.style.width = "100%";
          refs.progressBar.style.background = "#22c55e"; // Green
        }
        if (refs.statusMsg) {
          refs.statusMsg.textContent = `Success! Imported ${json.data.imported} entries (Skipped ${json.data.skipped}).`;
          refs.statusMsg.style.color = "#4ade80";
        }
        if (refs.importBtn) refs.importBtn.innerHTML = '<span class="material-icons">check_circle</span> Done';

        toast?.show?.(`Successfully imported ${json.data.imported} anime.`, "success");

        // Clear selected file to prevent accidental double-upload
        selectedFile = null;

        // Force reload library
        if (typeof libraryStore?.fetchRemote === "function") {
          await libraryStore.fetchRemote(true); // pass true if your fetchRemote handles a force refresh
        }
      } else {
        // Error UI
        throw new Error(json.error || "Failed to import file.");
      }

    } catch (err) {
      console.error("Import error", err);
      // Revert UI to error state
      if (refs.progressBar) refs.progressBar.style.background = "#ef4444"; // Red
      if (refs.statusMsg) {
        refs.statusMsg.textContent = `Error: ${err.message}`;
        refs.statusMsg.style.color = "#f87171";
      }
      if (refs.importBtn) {
        refs.importBtn.disabled = false;
        refs.importBtn.innerHTML = '<span class="material-icons">refresh</span> Try Again';
      }
      if (refs.statusArea) refs.statusArea.classList.remove("uploading");
      toast?.show?.(err.message || "Failed to import MAL data.", "error");
    }
  }

  refs.importBtn?.addEventListener("click", onImport);

  return Object.freeze({
    destroy() {
      refs.dropZone?.removeEventListener("click", () => refs.fileInput?.click());
      refs.dropZone?.removeEventListener("dragover", onDragOver);
      refs.dropZone?.removeEventListener("dragleave", onDragLeave);
      refs.dropZone?.removeEventListener("drop", onDrop);
      refs.importBtn?.removeEventListener("click", onImport);
    }
  });
}

export { readProfile, readSettings, initProfile, initSettings, initExport, initImport };


