/**
 * features/dashboard/dashboard.js
 * Consolidated Dashboard Module for Animyx.
 * Merges carousel, tracker, recommendations, upcoming, charts, milestones, and clip card logic.
 */

import { authFetch, apiUrl, BACKEND_ORIGIN, getAccessToken } from "../../config.js";
import { STATUS } from "../../store.js";
import { getTopOngoingAnikoto } from "../../core/appCore.js"; // Will point to core.js after next step

// ── Constants ────────────────────────────────────────────────────────────────

export const NEWS_CACHE_KEY = "Animyx_live_news_cache_v1";
export const NEWS_CACHE_TTL_MS = 30 * 60 * 1000;
export const NEWS_REFRESH_INTERVAL_MS = 10 * 60 * 1000;
export const NEWS_TOTAL_LIMIT = 5;

export const TRACKER_NOTIF_CACHE_KEY = "Animyx_tracker_notif_cache_v1";
export const DASHBOARD_CLIP_KEY = "Animyx_fav_clip";

export const DONUT_PALETTE = [
  { from: 'var(--chart-purple)', to: 'var(--chart-purple)' },
  { from: 'var(--chart-blue)', to: 'var(--chart-blue)' },
  { from: 'var(--chart-cyan)', to: 'var(--chart-cyan)' },
  { from: 'var(--chart-green)', to: 'var(--chart-green)' },
  { from: 'var(--chart-orange)', to: 'var(--chart-orange)' },
  { from: 'var(--chart-pink)', to: 'var(--chart-pink)' },
];

const GENRE_META = {
  action: { icon: "local_fire_department", color: "#8b5cf6" },
  adventure: { icon: "explore", color: "#a78bfa" },
  comedy: { icon: "sentiment_very_satisfied", color: "#c4b5fd" },
  drama: { icon: "theater_comedy", color: "#7c3aed" },
  fantasy: { icon: "auto_fix_high", color: "#9333ea" },
  romance: { icon: "favorite", color: "#d8b4fe" },
  "sci-fi": { icon: "rocket_launch", color: "#a78bfa" },
  slice: { icon: "local_cafe", color: "#c4b5fd" },
  mystery: { icon: "search", color: "#6d28d9" },
  thriller: { icon: "bolt", color: "#7e22ce" },
  horror: { icon: "psychology", color: "#581c87" },
  sports: { icon: "sports_baseball", color: "#9333ea" },
  supernatural: { icon: "visibility", color: "#8b5cf6" },
  isekai: { icon: "vpn_key", color: "#a78bfa" },
  mecha: { icon: "smart_toy", color: "#b7abd9" }
};

// ── Utilities ────────────────────────────────────────────────────────────────

export function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function relativeTime(ts) {
  if (!ts) return "";
  const diff = Date.now() - Number(ts);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function polarToCartesian(cx, cy, r, deg) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

export function describeDonutArc(cx, cy, outerR, innerR, startDeg, endDeg) {
  const o1 = polarToCartesian(cx, cy, outerR, startDeg);
  const o2 = polarToCartesian(cx, cy, outerR, endDeg);
  const i1 = polarToCartesian(cx, cy, innerR, endDeg);
  const i2 = polarToCartesian(cx, cy, innerR, startDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return [
    `M ${o1.x} ${o1.y}`,
    `A ${outerR} ${outerR} 0 ${large} 1 ${o2.x} ${o2.y}`,
    `L ${i1.x} ${i1.y}`,
    `A ${innerR} ${innerR} 0 ${large} 0 ${i2.x} ${i2.y}`,
    'Z'
  ].join(' ');
}

export function topGenres(items, limit = 3) {
  const counts = new Map();
  items.forEach((item) => {
    (item?.genres || []).forEach((genre) => {
      const key = String(genre || "").trim();
      if (!key) return;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

export function topGenresWithOthers(items, limit = 3) {
  const sorted = topGenres(items, Number.MAX_SAFE_INTEGER);
  if (sorted.length <= limit) return sorted;
  const head = sorted.slice(0, limit);
  const othersCount = sorted
    .slice(limit)
    .reduce((sum, [, count]) => sum + Number(count || 0), 0);
  if (othersCount > 0) head.push(["Others", othersCount]);
  return head;
}

export function topGenreNames(items) {
  const counts = new Map();
  items.forEach((item) => {
    (item?.genres || []).forEach((genre) => {
      const key = String(genre || "").trim();
      if (!key) return;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
}

export function derivePersonality(stats) {
  if (stats.completed >= 20) return { name: "Completionist", desc: "You close arcs and finish long runs consistently." };
  if (stats.watching >= 8) return { name: "Binge Explorer", desc: "You keep multiple ongoing stories active." };
  if (stats.plan >= 10) return { name: "Curator", desc: "You build deep queues before committing to a show." };
  return { name: "Rising Otaku", desc: "Your library is growing with a balanced watch pace." };
}

// ── Shared UI Helpers ────────────────────────────────────────────────────────

function getGenreConfig(genreName) {
  const norm = String(genreName).toLowerCase().replace(/_/g, " ");
  for (const [key, val] of Object.entries(GENRE_META)) {
    if (norm.includes(key)) return val;
  }
  return { icon: "local_offer", color: "#8b5cf6" };
}

export function renderGenreDonut(svgElement, entries, opts = {}) {
  if (!svgElement) return;
  const total = entries.reduce((s, [, c]) => s + Number(c || 0), 0);
  if (!total) { svgElement.innerHTML = ''; return; }
  const { cx = 100, cy = 100, outerR = 88, innerR = 52, showCenter = true } = opts;
  const uid = `dnt-${Math.random().toString(36).slice(2, 7)}`;
  const gradientDefs = entries.map((_, i) => {
    const c = DONUT_PALETTE[i % DONUT_PALETTE.length];
    return `<linearGradient id="${uid}-g${i}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${c.from}"/><stop offset="100%" stop-color="${c.to}"/></linearGradient>`;
  }).join('');
  const glowFilter = `<filter id="${uid}-glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
  let angle = -90;
  const slices = entries.map(([label, count], i) => {
    const value = Number(count || 0);
    const sweep = (value / total) * 360;
    const startDeg = angle + 2.2 / 2;
    const endDeg = angle + sweep - 2.2 / 2;
    angle += sweep;
    if (sweep < 1) return '';
    const pct = Math.round((value / total) * 100);
    const path = describeDonutArc(cx, cy, outerR, innerR, startDeg, endDeg);
    return `<path class="donut-slice" d="${path}" fill="url(#${uid}-g${i})" filter="url(#${uid}-glow)" data-tooltip="${escapeHtml(`${label} ${pct}% — ${count}`)}" style="animation-delay: ${i * 0.07}s"/>`;
  }).join('');
  const center = showCenter ? `<circle cx="${cx}" cy="${cy}" r="${innerR - 4}" fill="rgba(39,23,74,0.7)" /><text x="${cx}" y="${cy - 8}" text-anchor="middle" font-size="22" font-weight="800" fill="var(--text-primary)" font-family="inherit">${total}</text><text x="${cx}" y="${cy + 12}" text-anchor="middle" font-size="9" font-weight="600" fill="var(--text-muted)" font-family="inherit" letter-spacing="1">ANIME</text>` : '';
  svgElement.innerHTML = `<defs>${gradientDefs}${glowFilter}</defs>${slices}${center}`;
}

export function renderInsightGenreDonut(svgElement, entries) {
  if (!svgElement) return;
  const total = entries.reduce((s, c) => s + Number(c[1] || 0), 0);
  if (!total) {
    svgElement.innerHTML = `<g opacity="0.7"><circle cx="110" cy="110" r="98" fill="none" stroke="rgba(167, 139, 250, 0.18)" stroke-width="24" stroke-dasharray="10 8"></circle></g><text x="110" y="110" text-anchor="middle" fill="var(--text-muted)">No data</text>`;
    return;
  }
  const cx = 110, cy = 110, outerR = 100, innerR = 60;
  const uid = `ins-${Math.random().toString(36).slice(2, 7)}`;
  const gradientDefs = entries.map((_, i) => {
    const c = DONUT_PALETTE[i % DONUT_PALETTE.length];
    return `<linearGradient id="${uid}-ig${i}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${c.from}"/><stop offset="100%" stop-color="${c.to}"/></linearGradient>`;
  }).join('');
  let angle = -90;
  const slices = entries.map(([genre, count], i) => {
    const sweep = (Number(count) / total) * 360;
    const path = describeDonutArc(cx, cy, outerR, innerR, angle, angle + sweep);
    angle += sweep;
    return `<path d="${path}" fill="url(#${uid}-ig${i})" />`;
  }).join('');
  svgElement.innerHTML = `<defs>${gradientDefs}</defs>${slices}`;
}

export function renderDonutChart(container, segments, total, centerLabel, showLegend = true) {
  if (!container) return;
  const svgMarkup = `<svg viewBox="0 0 120 120" style="width:100%; height:100%"><text x="60" y="60" text-anchor="middle">${total}</text></svg>`;
  container.innerHTML = svgMarkup;
}


// ── Hero Carousel Module ─────────────────────────────────────────────────────

export function initHeroCarousel({ store, libraryStore, toast = null, onViewDetails = null, intervalMs = 5000, timers = globalThis }) {
  const root = document.getElementById("hero-carousel");
  if (!root) return { render() { }, destroy() { } };
  const slidesHost = root.querySelector(".hero-slides");
  const indicatorsHost = root.querySelector(".hero-indicators");
  const prevBtn = root.querySelector(".hero-prev");
  const nextBtn = root.querySelector(".hero-next");
  let items = [], index = 0, intervalId = 0;

  function setActive(nextIndex) {
    const slides = root.querySelectorAll(".hero-slide"), dots = root.querySelectorAll(".hero-indicator");
    slides.forEach((slide, i) => slide.classList.toggle("is-active", i === nextIndex));
    dots.forEach((dot, i) => dot.classList.toggle("active", i === nextIndex));
    index = nextIndex;
  }

  function render(topOngoingOverride = null) {
    const state = store.getState();
    const libraryItems = libraryStore?.getAll?.() || [];
    items = Array.isArray(topOngoingOverride) ? topOngoingOverride : getTopOngoingAnikoto(state, 10, libraryItems);
    index = 0;
    if (!slidesHost || !indicatorsHost) return;
    if (!items.length) {
      slidesHost.innerHTML = '<article class="hero-slide is-active"><div class="hero-slide-overlay"></div><div class="hero-slide-content"><h2 class="hero-title">No currently airing anime available</h2><p class="hero-countdown">Try refreshing datasets.</p></div></article>';
      indicatorsHost.innerHTML = ""; return;
    }
    slidesHost.innerHTML = items.map((anime, i) => {
      const title = escapeHtml(String(anime?.title || "Unknown Title")), image = escapeHtml(String(anime?.image || ""));
      const score = Number.isFinite(Number(anime?.score)) ? Number(anime.score).toFixed(2) : "N/A";
      const episodes = (() => { const n = Number(anime?.episodes); return (Number.isFinite(n) && n > 0) ? n : (String(anime?.status || '').toLowerCase().includes('airing') ? 'Ongoing' : 'Unknown'); })();
      const genres = (anime?.genres || []).slice(0, 4).map((genre) => `<span class="hero-genre-chip" data-genre="${escapeHtml(genre)}">${escapeHtml(genre)}</span>`).join("");
      return `<article class="hero-slide ${i === 0 ? "is-active" : ""}" data-index="${i}"><img class="hero-slide-bg" src="${image}" alt="${title}" loading="lazy" decoding="async" /><div class="hero-slide-overlay"></div><div class="hero-slide-content"><p class="hero-subtitle">Top Currently Airing</p><h2 class="hero-title">${title}</h2><div class="hero-meta"><span class="hero-score-badge">Score ${score}</span><span class="hero-episodes">${episodes} eps</span></div><p class="hero-countdown">${String(anime?.status || "").toLowerCase().includes("airing") ? "Currently airing" : "Schedule unavailable"}</p><div class="hero-genres">${genres}</div><div class="hero-actions"><button class="hero-btn hero-add-watchlist" type="button" data-hero-action="add" data-id="${Number(anime?.malId || 0)}">Add to Watchlist</button><button class="hero-btn hero-view-details" type="button" data-hero-action="details" data-id="${Number(anime?.malId || 0)}">View Details</button></div></div></article>`;
    }).join("");
    indicatorsHost.innerHTML = items.map((_, i) => `<button class="hero-indicator ${i === 0 ? "active" : ""}" type="button" data-hero-dot="${i}" aria-label="Go to slide ${i + 1}"></button>`).join("");
    slidesHost.querySelectorAll(".hero-slide-bg").forEach((image) => {
      const markLoaded = () => image.classList.add("is-loaded");
      if (image.complete && image.naturalWidth > 0) { markLoaded(); return; }
      image.addEventListener("load", markLoaded, { once: true });
      image.addEventListener("error", markLoaded, { once: true });
    });
  }

  function goNext() { if (items.length >= 2) setActive((index + 1) % items.length); }
  function goPrev() { if (items.length >= 2) setActive((index - 1 + items.length) % items.length); }
  function restartAutoPlay() { if (intervalId) timers.clearInterval(intervalId); if (items.length >= 2) intervalId = timers.setInterval(goNext, Math.max(1200, Number(intervalMs) || 5000)); }

  async function onClick(event) {
    const dot = event.target.closest("[data-hero-dot]");
    if (dot) { setActive(Number(dot.getAttribute("data-hero-dot") || 0)); restartAutoPlay(); return; }
    const actionBtn = event.target.closest("[data-hero-action]");
    if (!actionBtn) return;
    const action = String(actionBtn.getAttribute("data-hero-action") || ""), malId = Number(actionBtn.getAttribute("data-id") || 0);
    const anime = items.find((row) => Number(row?.malId || 0) === malId); if (!anime) return;
    if (action === "add") { libraryStore.upsert({ ...anime, status: STATUS.WATCHING }, STATUS.WATCHING); toast?.show?.("Added to watchlist"); restartAutoPlay(); }
    else if (action === "details" && onViewDetails) { await onViewDetails(anime); restartAutoPlay(); }
  }

  prevBtn?.addEventListener("click", () => { goPrev(); restartAutoPlay(); });
  nextBtn?.addEventListener("click", () => { goNext(); restartAutoPlay(); });
  root.addEventListener("click", onClick);
  const unsubscribe = store.subscribe(() => { render(); restartAutoPlay(); });
  render(); restartAutoPlay();
  return Object.freeze({ render, destroy() { unsubscribe(); root.removeEventListener("click", onClick); if (intervalId) timers.clearInterval(intervalId); } });
}

// ── Tracker Feed Module ──────────────────────────────────────────────────────

export function initTrackerFeed({ libraryStore, milestones = null }) {
  const listEl = document.getElementById("tracker-feed-list"), countBadge = document.getElementById("tracker-count-badge"), liveBadge = document.getElementById("tracker-live-badge");
  if (!listEl) return { destroy() { }, addEvent() { } };
  let backendItems = [], localItems = [];

  function renderRows(items) {
    if (!items.length) { listEl.innerHTML = '<div class="tracker-empty"><span class="material-icons">sensors_off</span><p>No active synchronization data.</p></div>'; return; }
    const typeMap = { SEQUEL_ANNOUNCED: { icon: "star", label: "Sequel", class: "sequel" }, FINISHED: { icon: "check_circle", label: "Done", class: "finished" }, TRACKING: { icon: "sensors", label: "Watching", class: "tracking" }, DUB: { icon: "mic", label: "Dub", class: "dub" }, REMINDER: { icon: "notifications", label: "Reminder", class: "reminder" }, GENERIC: { icon: "info", label: "Update", class: "tracking" } };
    listEl.innerHTML = items.map((n) => {
      const typeKey = String(n.type || "GENERIC").toUpperCase(), config = typeMap[typeKey] || typeMap.GENERIC;
      return `<div class="tracker-item" data-type="${typeKey}"><div class="tracker-badge ${config.class}"><span class="material-icons">${config.icon}</span></div><div class="tracker-item-body"><div class="tracker-item-title">${escapeHtml(n.title || "Activity Update")}</div><div class="tracker-item-meta"><span class="tracker-type-label ${config.class}">${config.label}</span><span>${relativeTime(n.created_at || n.ts)}</span></div></div></div>`;
    }).join("");
  }

  function render() {
    localItems = (libraryStore.getByStatus?.("watching") || []).map((a) => ({ type: "TRACKING", title: String(a?.title || "Unknown"), message: `Tracking "${a?.title}" — ${a?.episodes ? `${a.progress || 0}/${a.episodes} eps` : "airing"}`, ts: a?.updatedAt || 0 }));
    const all = [...backendItems.map(n => { let t = "System Update", m = n.message || "", mt = m.match(/^"(.*)" — (.*)$/); if (mt) { t = mt[1]; m = mt[2]; } return { type: n.type || "GENERIC", title: t, message: m, created_at: n.created_at ? new Date(n.created_at).getTime() : Date.now() }; }), ...localItems];
    const seen = new Set(), merged = all.filter(i => { const k = `${i.type}|${i.title}|${i.message}`; if (seen.has(k)) return false; seen.add(k); return true; }).sort((a,b) => (b.created_at || b.ts || 0) - (a.created_at || a.ts || 0));
    renderRows(merged);
    if (countBadge) { countBadge.textContent = merged.length > 99 ? "99+" : String(merged.length); countBadge.hidden = merged.length === 0; }
    if (liveBadge) { liveBadge.innerHTML = `<span class="live-badge-glow"></span>LIVE HUD`; liveBadge.hidden = localItems.length === 0; liveBadge.classList.toggle('label-live', localItems.length > 0); }
  }

  async function fetchBackend() {
    try {
      const allItems = []; let page = 1, hasMore = true;
      while (hasMore) {
        const res = await authFetch(apiUrl(`/notifications/me?page=${page}&limit=100`));
        if (!res.ok) break;
        const json = await res.json(), items = Array.isArray(json?.data) ? json.data : [];
        if (!items.length) break; allItems.push(...items);
        if (!json?.meta?.hasNext) hasMore = false; else page++;
      }
      backendItems = allItems; localStorage.setItem(TRACKER_NOTIF_CACHE_KEY, JSON.stringify(backendItems));
      milestones?.onNotificationsLoaded?.(backendItems);
    } catch { try { backendItems = JSON.parse(localStorage.getItem(TRACKER_NOTIF_CACHE_KEY) || "[]"); } catch { backendItems = []; } }
    render();
  }

  const unsub = libraryStore.subscribe?.(render);
  render(); void fetchBackend();
  return Object.freeze({ render, addEvent(ed) { backendItems.unshift({ type: ed.type || "SEQUEL_ANNOUNCED", message: ed.message || "New update", created_at: new Date().toISOString() }); milestones?.onNotificationsLoaded?.(backendItems); render(); }, destroy() { unsub?.(); } });
}

// ── Recommendations Module ───────────────────────────────────────────────────

export function initRecommendations({ store, libraryStore, selectors, toast = null }) {
  const dashboardRoot = document.getElementById("dashboard-view") || document;
  const refs = { recommendedList: document.getElementById("recommended-list"), quickTotal: document.getElementById("quick-total"), quickPlan: document.getElementById("quick-plan"), quickGenres: document.getElementById("quick-genres"), quickTopGenres: document.getElementById("quick-top-genres"), personalityName: document.getElementById("anime-personality-name"), personalityDesc: document.getElementById("anime-personality-desc"), dashboardGenreSvg: document.getElementById("completed-genre-pie"), dashboardGenreLegend: dashboardRoot.querySelector(".stats-container .legend") };
  let backendRecs = null;

  async function fetchRecs() {
    try {
      const res = await authFetch(apiUrl("/user/me/recommendations"));
      if (res.ok) { backendRecs = (await res.json())?.data || []; if (backendRecs.length) render(); }
    } catch { backendRecs = []; }
  }

  function render() {
    const libraryItems = libraryStore.getAll(), stats = libraryStore.getStats(), genres = topGenres(libraryItems, 3), personality = derivePersonality(stats), completed = libraryItems.filter(i => String(i?.status || "").toLowerCase() === "completed");
    if (refs.quickTotal) refs.quickTotal.textContent = String(stats.total);
    if (refs.quickPlan) refs.quickPlan.textContent = String(stats.plan);
    if (refs.quickGenres) refs.quickGenres.textContent = String(genres.length);
    if (refs.personalityName) refs.personalityName.textContent = personality.name;
    if (refs.personalityDesc) refs.personalityDesc.textContent = personality.desc;
    if (refs.quickTopGenres) refs.quickTopGenres.innerHTML = genres.length ? genres.map(([g]) => { const c = getGenreConfig(g); return `<div class="genre-chip" style="--accent: ${c.color}"><span class="material-icons">${c.icon}</span><span>${escapeHtml(g)}</span></div>`; }).join("") : '<span class="anime-card-meta">No genre data yet</span>';
    if (refs.dashboardGenreSvg && refs.dashboardGenreLegend) {
      const entries = topGenresWithOthers(completed, 3);
      if (!entries.length) { refs.dashboardGenreSvg.innerHTML = `<g transform="translate(100,100)"><circle r="95" fill="none" stroke="rgba(167, 139, 250, 0.14)" stroke-width="20" stroke-dasharray="10 10"></circle><text x="0" y="5" text-anchor="middle" fill="var(--text-muted)" font-size="0.8rem">No Data</text></g>`; refs.dashboardGenreLegend.innerHTML = '<div class="anime-card-meta" style="margin-bottom:0; text-align: center; width: 100%;">Complete anime to see distribution.</div>'; }
      else {
        renderGenreDonut(refs.dashboardGenreSvg, entries);
        const total = entries.reduce((s, [, c]) => s + Number(c || 0), 0), palette = ["var(--chart-purple)", "var(--chart-blue)", "var(--chart-cyan)", "var(--chart-green)", "var(--chart-orange)", "var(--chart-pink)"];
        refs.dashboardGenreLegend.innerHTML = entries.map(([n, c], i) => `<div class="legend-item"><span class="legend-dot" style="background: ${palette[i % palette.length]}"></span><div class="legend-label"><span class="anime-card-meta" style="margin-bottom:0;color:var(--text-primary); font-weight:600;">${escapeHtml(n)}</span><span class="anime-card-meta" style="margin-bottom:0;font-size:0.6rem;">${Math.round((Number(c || 0)/total)*100)}%</span></div></div>`).join('');
      }
    }
    const rows = (backendRecs?.length) ? backendRecs : (() => { const topGenresList = topGenreNames(libraryItems), eid = new Set(libraryItems.map(i => Number(i?.malId || 0))); return selectors.getCombinedDiscoveryState(store.getState()).filter(a => !eid.has(Number(a?.malId || 0))).sort((l,r) => { const lm = (l?.genres || []).filter(g => topGenresList.includes(g)).length, rm = (r?.genres || []).filter(g => topGenresList.includes(g)).length; return rm !== lm ? rm - lm : Number(r?.score || 0) - Number(l?.score || 0); }).slice(0, 10); })();
    if (refs.recommendedList) refs.recommendedList.innerHTML = rows.length ? rows.map((a) => `<div class="reco-card" data-id="${Number(a?.malId || a?.mal_id || 0)}"><div class="reco-thumb-wrap"><img class="reco-thumb" src="${escapeHtml(a?.image || "")}" alt="${escapeHtml(a?.title || "")}"></div><div class="reco-body"><div class="reco-title" title="${escapeHtml(a?.title || "")}">${escapeHtml(a?.title || "")}</div><div class="reco-genres">${(a?.genres || []).slice(0, 3).join(", ") || "Genre TBD"}</div><button class="reco-add-btn" type="button" data-reco-action="add-plan" data-id="${Number(a?.malId || a?.mal_id || 0)}">Add to Plan</button></div></div>`).join("") : `<div class="tracker-empty" style="text-align: center; padding: 2rem 1rem;"><span class="material-icons" style="font-size: 2.5rem; color: var(--text-gray-600); margin-bottom: 0.5rem;">auto_awesome</span><p class="anime-card-meta">Add anime to your watchlist to unlock personalized recommendations.</p></div>`;
  }

  function onClick(e) {
    const btn = e.target.closest("[data-reco-action='add-plan']"); if (!btn) return;
    const malId = Number(btn.dataset.id || 0); const anime = selectors.getCombinedDiscoveryState(store.getState()).find(r => Number(r?.malId || 0) === malId);
    if (anime) { libraryStore.upsert({ ...anime, status: "plan" }, "plan"); toast?.show?.("Added to watchlist"); }
  }

  refs.recommendedList?.addEventListener("click", onClick);
  const unsubs = [store.subscribe(render), libraryStore.subscribe(render)];
  render(); fetchRecs();
  return Object.freeze({ render, destroy() { refs.recommendedList?.removeEventListener("click", onClick); unsubs.forEach(fn => fn()); } });
}

// ── Upcoming Widget Module ───────────────────────────────────────────────────

export function initUpcomingWidget({ fetchImpl = fetch.bind(globalThis), storage = globalThis.localStorage, timers = globalThis }) {
  const CACHE_KEY = "Animyx_dashboard_upcoming_v1", CACHE_TTL_MS = 12 * 60 * 60 * 1000, listEl = document.getElementById("dashboard-upcoming-list");
  if (!listEl) return { render() { }, destroy() { } };
  let upcomingTimer = 0, currentItems = [];

  async function loadData({ force = false } = {}) {
    let cached = null, expired = true;
    try { const raw = storage?.getItem?.(CACHE_KEY); if (raw) { const c = JSON.parse(raw); if (Array.isArray(c.data)) { cached = c.data; expired = (Date.now() - c.ts >= CACHE_TTL_MS); } } } catch { }
    if (cached && !force) { currentItems = cached; renderRows(); if (!expired) return; }
    else { listEl.innerHTML = Array(6).fill('<div class="news-item is-skeleton"><div class="news-thumb skeleton-thumb"></div><div class="news-badge skeleton-badge"></div><div><h4 class="anime-card-title skeleton-title"></h4><div class="flex items-center gap-1 anime-card-meta skeleton-meta"></div></div></div>').join(""); }
    try {
      const res = await fetchImpl(apiUrl("/anime/upcoming?limit=6"));
      if (res.ok) { currentItems = (await res.json())?.data || []; renderRows(); storage?.setItem?.(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: currentItems })); }
    } catch { if (!cached) listEl.innerHTML = '<div class="anime-card-meta">Unable to load upcoming anime.</div>'; }
  }

  function renderRows() {
    if (!currentItems.length) { listEl.innerHTML = '<div class="tracker-empty">No upcoming anime found.</div>'; return; }
    listEl.innerHTML = currentItems.map(item => {
      const malId = Number(item.mal_id || 0); let title = item.title_english || item.title || "Unknown Title";
      return `<div class="news-item upcoming-release-card" data-action="open-anime-modal" data-id="${malId}"><div class="news-thumb upcoming-release-poster">${item.images?.jpg?.image_url ? `<img class="news-thumb-img" src="${escapeHtml(item.images.jpg.image_url)}" alt="${escapeHtml(title)}" loading="lazy" />` : '<div class="news-thumb-fallback">🎬</div>'}</div><div class="upcoming-release-content"><h4 class="anime-card-title upcoming-release-title">${escapeHtml(title)}</h4><div class="anime-card-meta upcoming-release-meta"><span>${escapeHtml(String(item.aired?.string || "TBA").split("to")[0].trim())} • ${escapeHtml(item.studios?.[0]?.name || "Unknown Studio")}</span></div></div><div class="news-badge news-badge-mal upcoming-release-badge"><span class="material-icons upcoming-release-badge-icon">local_fire_department</span></div></div>`;
    }).join("");
  }

  loadData(); upcomingTimer = timers.setInterval(() => loadData({ force: true }), CACHE_TTL_MS);
  return Object.freeze({ render() { if (!currentItems.length) loadData(); else renderRows(); }, destroy() { if (upcomingTimer) timers.clearInterval(upcomingTimer); } });
}

// ── Clip Card Module ─────────────────────────────────────────────────────────

export function initClipCard({ storage = globalThis.localStorage } = {}) {
  const card = document.querySelector(".clip-placeholder-card"); if (!card) return { render() { }, destroy() { } };
  let clipSignature = "", livePreUrl = "", livePreTag = "img";

  function render() {
    const saved = livePreUrl || String(storage?.getItem?.(DASHBOARD_CLIP_KEY) || "").trim();
    const sig = saved ? `f:${saved.length}:${saved.slice(0, 32)}` : "e";
    if (clipSignature === sig) return; clipSignature = sig;
    if (!saved) { card.innerHTML = `<input type="file" id="clip-upload" accept="video/*,image/*" hidden /><span class="placeholder-text">Insert Your Favorite Clip</span>`; card.classList.remove("has-media"); return; }
    const tag = livePreUrl ? livePreTag : (String(saved).startsWith("data:video/") ? "video" : "img");
    card.innerHTML = `${tag === "video" ? `<video class="clip-media" src="${saved}" autoplay muted loop playsinline preload="metadata"></video>` : `<img class="clip-media" src="${saved}" alt="Clip" loading="lazy" />`}<button type="button" class="remove-clip">Remove</button>`;
    card.classList.add("has-media");
  }

  function onClick(e) { if (e.target.closest(".remove-clip")) { livePreUrl = ""; storage?.removeItem?.(DASHBOARD_CLIP_KEY); render(); } else { card.querySelector("#clip-upload")?.click(); } }
  function onChange(e) {
    const f = e.target.files?.[0]; if (!f) return;
    if (livePreUrl) URL.revokeObjectURL(livePreUrl);
    livePreUrl = URL.createObjectURL(f); livePreTag = f.type.startsWith("video/") ? "video" : "img";
    if (livePreTag === "img") { const fr = new FileReader(); fr.onload = () => { if (fr.result) storage?.setItem?.(DASHBOARD_CLIP_KEY, String(fr.result)); }; fr.readAsDataURL(f); }
    else storage?.removeItem?.(DASHBOARD_CLIP_KEY);
    render(); e.target.value = "";
  }

  card.addEventListener("click", onClick); card.addEventListener("change", onChange); render();
  return { render, destroy() { if (livePreUrl) URL.revokeObjectURL(livePreUrl); card.removeEventListener("click", onClick); card.removeEventListener("change", onChange); } };
}

// ── Milestones Module ────────────────────────────────────────────────────────

export function initMilestones({ libraryStore }) {
  const KEY = "Animyx_dismissed_milestones", dismissed = new Set(JSON.parse(localStorage.getItem(KEY) || "[]"));
  const milestones = [
    { id: "starter", title: "Rising Star", threshold: 1, text: "Completed your first anime!", icon: "star" },
    { id: "veteran", title: "Anime Veteran", threshold: 25, text: "Completed 25 series. True dedication!", icon: "workspace_premium" },
    { id: "legend", title: "Legendary Viewer", threshold: 100, text: "100 series finished! You are a master.", icon: "military_tech" }
  ];
  function render() {
    const stats = libraryStore.getStats(), container = document.getElementById("milestones-container"); if (!container) return;
    const avail = milestones.filter(m => stats.completed >= m.threshold && !dismissed.has(m.id));
    container.innerHTML = avail.map(m => `<div class="milestone-toast" data-id="${m.id}"><span class="material-icons">${m.icon}</span><div class="milestone-content"><strong>${m.title}</strong><p>${m.text}</p></div><button class="milestone-close" data-action="dismiss-milestone">✕</button></div>`).join("");
  }
  function onDismiss(e) {
    const btn = e.target.closest("[data-action='dismiss-milestone']"); if (!btn) return;
    const id = btn.closest(".milestone-toast").dataset.id; dismissed.add(id);
    localStorage.setItem(KEY, JSON.stringify([...dismissed])); render();
  }
  const el = document.getElementById("milestones-container"); el?.addEventListener("click", onDismiss);
  const unsub = libraryStore.subscribe(render); render();
  return { destroy() { unsub(); el?.removeEventListener("click", onDismiss); } };
}

// ── Main Dashboard Facade ───────────────────────────────────────────────────

export function initDashboardModules(ctx) {
  const heroCarousel = initHeroCarousel(ctx);
  const recommendations = initRecommendations(ctx);
  const upcomingWidget = initUpcomingWidget(ctx);
  const clipCard = initClipCard(ctx);

  return Object.freeze({
    heroCarousel, recommendations, upcomingWidget, clipCard,
    render() {
      const state = ctx?.store?.getState?.() || {};
      const libraryItems = ctx?.libraryStore?.getAll?.() || [];
      heroCarousel?.render?.(getTopOngoingAnikoto(state, 10, libraryItems));
      recommendations?.render?.(); upcomingWidget?.render?.(); clipCard?.render?.();
    },
    destroy() {
      clipCard?.destroy?.(); upcomingWidget?.destroy?.(); recommendations?.destroy?.(); heroCarousel?.destroy?.();
    }
  });
}

// Re-export insights separate (too large to merge)
export { initInsights } from "./insights.js";
