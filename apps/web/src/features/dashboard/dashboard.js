/**
 * features/dashboard/dashboard.js
 * Consolidated Dashboard Module for Animyx.
 * Merges carousel, tracker, recommendations, upcoming, charts, milestones, and clip card logic.
 */

import { authFetch, apiUrl } from "../../config.js";
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
  { from: 'var(--chart-red)', to: 'var(--chart-red)' },
  { from: 'var(--chart-orange)', to: 'var(--chart-orange)' },
  { from: 'var(--chart-yellow)', to: 'var(--chart-yellow)' },
  { from: 'var(--chart-green)', to: 'var(--chart-green)' },
  { from: 'var(--chart-blue)', to: 'var(--chart-blue)' },
  { from: 'var(--chart-indigo)', to: 'var(--chart-indigo)' },
  { from: 'var(--chart-violet)', to: 'var(--chart-violet)' },
];

const GENRE_META = {
  action: { icon: "local_fire_department", color: "var(--insight-red)" },
  adventure: { icon: "explore", color: "var(--insight-orange)" },
  comedy: { icon: "sentiment_very_satisfied", color: "var(--insight-yellow)" },
  drama: { icon: "theater_comedy", color: "var(--insight-blue)" },
  fantasy: { icon: "auto_fix_high", color: "var(--insight-violet)" },
  romance: { icon: "favorite", color: "var(--insight-pink, #f472b6)" }, /* fallback if pink missing */
  "sci-fi": { icon: "rocket_launch", color: "var(--insight-blue)" },
  slice: { icon: "local_cafe", color: "var(--insight-green)" },
  mystery: { icon: "search", color: "var(--insight-indigo)" },
  thriller: { icon: "bolt", color: "var(--insight-red)" },
  horror: { icon: "psychology", color: "var(--insight-violet)" },
  sports: { icon: "sports_baseball", color: "var(--insight-orange)" },
  supernatural: { icon: "visibility", color: "var(--insight-indigo)" },
  isekai: { icon: "vpn_key", color: "var(--insight-green)" },
  mecha: { icon: "smart_toy", color: "var(--insight-blue)" }
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
  const slices = entries.map(([_genre, count], i) => {
    const sweep = (Number(count) / total) * 360;
    const path = describeDonutArc(cx, cy, outerR, innerR, angle, angle + sweep);
    angle += sweep;
    return `<path d="${path}" fill="url(#${uid}-ig${i})" />`;
  }).join('');
  svgElement.innerHTML = `<defs>${gradientDefs}</defs>${slices}`;
}

export function renderDonutChart(container, segments, total, centerLabel, _showLegend = true) {
  if (!container) return;
  const cx = 60, cy = 60, outerR = 54, innerR = 38;
  const _uid = `dnt-${Math.random().toString(36).slice(2, 7)}`;
  
  const totalVal = Number(total || 0);
  if (totalVal <= 0) {
    container.innerHTML = `<svg viewBox="0 0 120 120" class="insight-donut-svg"><circle cx="${cx}" cy="${cy}" r="${outerR}" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="${outerR - innerR}" /><text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" fill="var(--text-muted)" font-size="10">No Data</text></svg>`;
    return;
  }

  let angle = -90;
  const paths = segments.map((s, i) => {
    const sweep = (Number(s.value || 0) / totalVal) * 360;
    if (sweep <= 0) return "";
    const path = describeDonutArc(cx, cy, outerR, innerR, angle, angle + sweep);
    angle += sweep;
    return `<path d="${path}" fill="${s.color || 'var(--brand-primary)'}" transform-origin="${cx}px ${cy}px" style="animation: donutGrow 0.6s ease-out forwards; animation-delay: ${i * 0.1}s; opacity: 0;" />`;
  }).join("");

  const centerArea = `
    <circle cx="${cx}" cy="${cy}" r="${innerR - 2}" fill="rgba(20, 15, 40, 0.4)" />
    <text x="${cx}" y="${cy - 4}" text-anchor="middle" fill="var(--text-primary)" font-size="14" font-weight="800">${escapeHtml(centerLabel || totalVal)}</text>
    <text x="${cx}" y="${cy + 8}" text-anchor="middle" fill="var(--text-muted)" font-size="7" font-weight="600" letter-spacing="0.5">COMPLETED</text>
  `;

  container.innerHTML = `
    <svg viewBox="0 0 120 120" class="insight-donut-svg" style="width:100%; height:100%;">
      <defs>
        <style>
          @keyframes donutGrow {
            from { opacity: 0; transform: scale(0.92); }
            to { opacity: 1; transform: scale(1); }
          }
        </style>
      </defs>
      ${paths}
      ${centerArea}
    </svg>
  `;
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
    const all = [...backendItems.map(n => { let t = "System Update", m = n.message || ""; const mt = m.match(/^"(.*)" — (.*)$/); if (mt) { t = mt[1]; m = mt[2]; } return { type: n.type || "GENERIC", title: t, message: m, created_at: n.created_at ? new Date(n.created_at).getTime() : Date.now() }; }), ...localItems];
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
  const VISIBLE_RECOMMENDATION_CARDS = 3;
  let backendRecs = null;
  let recommendationResizeRaf = 0;

  async function fetchRecs() {
    try {
      const res = await authFetch(apiUrl("/user/me/recommendations"));
      if (res.ok) { backendRecs = (await res.json())?.data || []; if (backendRecs.length) render(); }
    } catch { backendRecs = []; }
  }

  function formatScore(score) {
    const parsed = Number(score);
    if (!Number.isFinite(parsed) || parsed <= 0) return "";
    return parsed.toFixed(1).replace(/\.0$/, "");
  }

  function buildRecommendationCard(anime) {
    const malId = Number(anime?.malId || anime?.mal_id || 0);
    const title = escapeHtml(anime?.title || "Untitled");
    const image = escapeHtml(
      anime?.image
      || anime?.poster
      || anime?.images?.jpg?.large_image_url
      || anime?.images?.jpg?.image_url
      || "https://via.placeholder.com/225x320?text=No+Image"
    );
    const genres = Array.isArray(anime?.genres) ? anime.genres.filter(Boolean).slice(0, 3) : [];
    const genresLabel = escapeHtml(genres.join(", ") || "Genre TBD");
    const scoreLabel = formatScore(anime?.score);
    const type = String(anime?.type || "").trim().toUpperCase();
    const year = Number.parseInt(anime?.year, 10);
    const chips = [
      type ? `<span class="reco-chip">${escapeHtml(type)}</span>` : "",
      Number.isFinite(year) && year > 1900 ? `<span class="reco-chip">${year}</span>` : ""
    ].filter(Boolean).join("");

    return `<article class="reco-card" data-id="${malId}">
      <div class="reco-thumb-wrap">
        <img class="reco-thumb" src="${image}" alt="${title}" loading="lazy" decoding="async">
        ${scoreLabel ? `<span class="reco-score-badge"><span class="material-icons" aria-hidden="true">star</span>${scoreLabel}</span>` : ""}
      </div>
      <div class="reco-body">
        <div class="reco-text">
          <div class="reco-title" title="${title}">${title}</div>
          <div class="reco-genres">${genresLabel}</div>
        </div>
        <div class="reco-footer">
          <div class="reco-meta">${chips || '<span class="reco-chip reco-chip-muted">Fresh Pick</span>'}</div>
          <button class="reco-add-btn" type="button" data-reco-action="add-plan" data-id="${malId}">Add to Plan</button>
        </div>
      </div>
    </article>`;
  }

  function applyRecommendationViewport() {
    if (!refs.recommendedList) return;
    const cards = Array.from(refs.recommendedList.querySelectorAll(".reco-card"));

    if (!cards.length) {
      refs.recommendedList.style.maxHeight = "";
      refs.recommendedList.style.overflowY = "visible";
      return;
    }

    const visibleCount = Math.min(VISIBLE_RECOMMENDATION_CARDS, cards.length);
    const gapRaw = getComputedStyle(refs.recommendedList).rowGap || getComputedStyle(refs.recommendedList).gap || "0";
    const gap = Number.parseFloat(gapRaw) || 0;
    const visibleHeight = cards
      .slice(0, visibleCount)
      .reduce((sum, card) => sum + card.getBoundingClientRect().height, 0)
      + (visibleCount > 1 ? (gap * (visibleCount - 1)) : 0);

    refs.recommendedList.style.maxHeight = `${Math.ceil(visibleHeight)}px`;
    refs.recommendedList.style.overflowY = cards.length > VISIBLE_RECOMMENDATION_CARDS ? "auto" : "visible";
  }

  function syncRecommendationViewport() {
    applyRecommendationViewport();
    requestAnimationFrame(() => applyRecommendationViewport());
  }

  function onRecommendationResize() {
    if (recommendationResizeRaf) cancelAnimationFrame(recommendationResizeRaf);
    recommendationResizeRaf = requestAnimationFrame(() => {
      recommendationResizeRaf = 0;
      applyRecommendationViewport();
    });
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
        const total = entries.reduce((s, [, c]) => s + Number(c || 0), 0), palette = ["var(--chart-red)", "var(--chart-orange)", "var(--chart-yellow)", "var(--chart-green)", "var(--chart-blue)", "var(--chart-indigo)", "var(--chart-violet)"];
        refs.dashboardGenreLegend.innerHTML = entries.map(([n, c], i) => `<div class="legend-item"><span class="legend-dot" style="background: ${palette[i % palette.length]}"></span><div class="legend-label"><span class="anime-card-meta" style="margin-bottom:0;color:var(--text-primary); font-weight:600;">${escapeHtml(n)}</span><span class="anime-card-meta" style="margin-bottom:0;font-size:0.6rem;">${Math.round((Number(c || 0)/total)*100)}%</span></div></div>`).join('');
      }
    }
    const rows = (backendRecs?.length) ? backendRecs : (() => { const topGenresList = topGenreNames(libraryItems), eid = new Set(libraryItems.map(i => Number(i?.malId || 0))); return selectors.getCombinedDiscoveryState(store.getState()).filter(a => !eid.has(Number(a?.malId || 0))).sort((l,r) => { const lm = (l?.genres || []).filter(g => topGenresList.includes(g)).length, rm = (r?.genres || []).filter(g => topGenresList.includes(g)).length; return rm !== lm ? rm - lm : Number(r?.score || 0) - Number(l?.score || 0); }).slice(0, 10); })();
    if (refs.recommendedList) refs.recommendedList.innerHTML = rows.length ? rows.map(buildRecommendationCard).join("") : `<div class="tracker-empty" style="text-align: center; padding: 2rem 1rem;"><span class="material-icons" style="font-size: 2.5rem; color: var(--text-gray-600); margin-bottom: 0.5rem;">auto_awesome</span><p class="anime-card-meta">Add anime to your watchlist to unlock personalized recommendations.</p></div>`;
    syncRecommendationViewport();
  }

  function onClick(e) {
    const btn = e.target.closest("[data-reco-action='add-plan']"); if (!btn) return;
    const malId = Number(btn.dataset.id || 0); const anime = selectors.getCombinedDiscoveryState(store.getState()).find(r => Number(r?.malId || 0) === malId);
    if (anime) { libraryStore.upsert({ ...anime, status: "plan" }, "plan"); toast?.show?.("Added to watchlist"); }
  }

  refs.recommendedList?.addEventListener("click", onClick);
  window.addEventListener("resize", onRecommendationResize);
  const unsubs = [store.subscribe(render), libraryStore.subscribe(render)];
  render(); fetchRecs();
  return Object.freeze({ render, destroy() { refs.recommendedList?.removeEventListener("click", onClick); window.removeEventListener("resize", onRecommendationResize); if (recommendationResizeRaf) cancelAnimationFrame(recommendationResizeRaf); unsubs.forEach(fn => fn()); } });
}

// ── Upcoming Widget Module ───────────────────────────────────────────────────

export function initUpcomingWidget({ fetchImpl = fetch.bind(globalThis), storage = globalThis.localStorage, timers = globalThis }) {
  const CACHE_KEY = "Animyx_dashboard_upcoming_v1", CACHE_TTL_MS = 1 * 60 * 60 * 1000, listEl = document.getElementById("dashboard-upcoming-list");
  const refreshBtn = document.getElementById("upcoming-refresh-btn");
  const lastUpdatedEl = document.getElementById("upcoming-last-updated");
  if (!listEl) return { render() { }, destroy() { } };
  let upcomingTimer = 0, currentItems = [];

  function updateLastUpdatedLabel() {
    if (!lastUpdatedEl) return;
    try {
      const raw = storage?.getItem?.(CACHE_KEY);
      if (raw) {
        const c = JSON.parse(raw);
        if (c.ts) {
          const mins = Math.round((Date.now() - c.ts) / 60000);
          lastUpdatedEl.textContent = mins < 1 ? 'Updated just now' : `Updated ${mins}m ago`;
        }
      }
    } catch { lastUpdatedEl.textContent = ''; }
  }

  function setRefreshSpinning(spinning) {
    if (!refreshBtn) return;
    const icon = refreshBtn.querySelector('.material-icons');
    if (!icon) return;
    if (spinning) {
      icon.style.animation = 'spin 0.7s linear infinite';
      refreshBtn.disabled = true;
      refreshBtn.style.opacity = '0.5';
    } else {
      icon.style.animation = '';
      refreshBtn.disabled = false;
      refreshBtn.style.opacity = '1';
    }
  }

  async function loadData({ force = false } = {}) {
    let cached = null, expired = true;
    try { const raw = storage?.getItem?.(CACHE_KEY); if (raw) { const c = JSON.parse(raw); if (Array.isArray(c.data)) { cached = c.data; expired = (Date.now() - c.ts >= CACHE_TTL_MS); } } } catch { }
    if (cached && !force) { currentItems = cached; renderRows(); updateLastUpdatedLabel(); if (!expired) return; }
    else { listEl.innerHTML = Array(6).fill('<div class="news-item is-skeleton"><div class="news-thumb skeleton-thumb"></div><div class="news-badge skeleton-badge"></div><div><h4 class="anime-card-title skeleton-title"></h4><div class="flex items-center gap-1 anime-card-meta skeleton-meta"></div></div></div>').join(""); }
    setRefreshSpinning(true);
    try {
      const res = await fetchImpl(apiUrl("/anime/upcoming?limit=6"));
      if (res.ok) { currentItems = (await res.json())?.data || []; renderRows(); storage?.setItem?.(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: currentItems })); updateLastUpdatedLabel(); }
    } catch { if (!cached) listEl.innerHTML = '<div class="anime-card-meta">Unable to load upcoming anime.</div>'; }
    finally { setRefreshSpinning(false); }
  }

  function renderRows() {
    if (!currentItems.length) { listEl.innerHTML = '<div class="tracker-empty">No upcoming anime found.</div>'; return; }
    listEl.innerHTML = currentItems.map(item => {
      const malId = Number(item.mal_id || 0); const title = item.title_english || item.title || "Unknown Title";
      return `<div class="news-item upcoming-release-card" data-action="open-anime-modal" data-id="${malId}"><div class="news-thumb upcoming-release-poster">${item.images?.jpg?.image_url ? `<img class="news-thumb-img" src="${escapeHtml(item.images.jpg.image_url)}" alt="${escapeHtml(title)}" loading="lazy" />` : '<div class="news-thumb-fallback">🎬</div>'}</div><div class="upcoming-release-content"><h4 class="anime-card-title upcoming-release-title">${escapeHtml(title)}</h4><div class="anime-card-meta upcoming-release-meta"><span>${escapeHtml(String(item.aired?.string || "TBA").split("to")[0].trim())} • ${escapeHtml(item.studios?.[0]?.name || "Unknown Studio")}</span></div></div><div class="news-badge news-badge-mal upcoming-release-badge"><span class="material-icons upcoming-release-badge-icon">local_fire_department</span></div></div>`;
    }).join("");
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => loadData({ force: true }));
    refreshBtn.addEventListener('mouseenter', () => { if (!refreshBtn.disabled) refreshBtn.style.color = 'var(--brand-primary)'; });
    refreshBtn.addEventListener('mouseleave', () => { refreshBtn.style.color = 'var(--text-muted)'; });
  }

  // Inject spin keyframes if not already present
  if (!document.getElementById('upcoming-refresh-spin-style')) {
    const style = document.createElement('style');
    style.id = 'upcoming-refresh-spin-style';
    style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
    document.head.appendChild(style);
  }

  loadData(); upcomingTimer = timers.setInterval(() => loadData({ force: true }), CACHE_TTL_MS);
  return Object.freeze({ render() { if (!currentItems.length) loadData(); else renderRows(); }, destroy() { if (upcomingTimer) timers.clearInterval(upcomingTimer); } });
}

// ── Clip Card Module ─────────────────────────────────────────────────────────

export function initClipCard({ storage = globalThis.localStorage } = {}) {
  const card = document.querySelector(".clip-placeholder-card"); if (!card) return { render() { }, destroy() { } };
  let clipSignature = "", livePreUrl = "", livePreTag = "img";

  function normalizeMediaSrc(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    try {
      const parsed = new URL(raw, globalThis.location?.origin || "http://localhost");
      const protocol = String(parsed.protocol || "").toLowerCase();
      if (protocol === "http:" || protocol === "https:" || protocol === "data:" || protocol === "blob:") {
        return parsed.href;
      }
    } catch (_) {
      return "";
    }
    return "";
  }

  function render() {
    const saved = livePreUrl || String(storage?.getItem?.(DASHBOARD_CLIP_KEY) || "").trim();
    const sig = saved ? `f:${saved.length}:${saved.slice(0, 32)}` : "e";
    if (clipSignature === sig) return; clipSignature = sig;
    if (!saved) { card.innerHTML = `<input type="file" id="clip-upload" accept="video/*,image/*" hidden /><span class="placeholder-text">Insert Your Favorite Clip</span>`; card.classList.remove("has-media"); return; }
    const safeSrc = normalizeMediaSrc(saved);
    if (!safeSrc) {
      storage?.removeItem?.(DASHBOARD_CLIP_KEY);
      card.innerHTML = `<input type="file" id="clip-upload" accept="video/*,image/*" hidden /><span class="placeholder-text">Insert Your Favorite Clip</span>`;
      card.classList.remove("has-media");
      return;
    }
    const tag = livePreUrl ? livePreTag : (String(saved).startsWith("data:video/") ? "video" : "img");
    card.innerHTML = `${tag === "video" ? `<video class="clip-media" src="${safeSrc}" autoplay muted loop playsinline preload="metadata"></video>` : `<img class="clip-media" src="${safeSrc}" alt="Clip" loading="lazy" />`}<button type="button" class="remove-clip">Remove</button>`;
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
  const grid = document.getElementById("milestone-grid");
  if (!grid) return { render() {}, destroy() {} };
  
  const tiles = Array.from(grid.querySelectorAll(".milestone-tile"));
  if (tiles.length < 12) return { render() {}, destroy() {} };

  function render() {
    const stats = libraryStore.getStats();
    const items = libraryStore.getAll();
    const ratedCount = items.filter(i => i && i.userRating > 0).length;
    const epsWatched = items.reduce((sum, item) => sum + (Number(item?.watchedEpisodes || item?.progress) || 0), 0);
    
    // Tier 1
    if (stats.total >= 1) tiles[0].classList.remove("locked");
    if (stats.watching >= 1) tiles[1].classList.remove("locked");
    if (stats.total >= 5) tiles[2].classList.remove("locked");
    if (stats.completed >= 1) tiles[3].classList.remove("locked");
    if (stats.total >= 10) tiles[4].classList.remove("locked");
    if (stats.watching >= 3) tiles[5].classList.remove("locked");
    
    // Tier 2
    if (ratedCount >= 1) tiles[6].classList.remove("locked");
    if (epsWatched >= 10) tiles[7].classList.remove("locked");
    if (epsWatched >= 500) tiles[8].classList.remove("locked");
    if (stats.completed >= 25) tiles[9].classList.remove("locked");
    if (ratedCount >= 25) tiles[10].classList.remove("locked");
    if (stats.total >= 100) tiles[11].classList.remove("locked");
  }

  const unsub = libraryStore.subscribe(render);
  render();
  return { destroy() { unsub(); } };
}

// ── Trivia Module ─────────────────────────────────────────────────────────────

export function initTriviaCard({ libraryStore }) {
  const titleEl = document.getElementById("promo-trivia-text");
  const subEl = document.getElementById("promo-trivia-sub");
  if (!titleEl || !subEl) return { render() {}, destroy() {} };
  
  function render() {
    const items = libraryStore.getAll().filter(i => i && i.malId);
    if (!items.length) {
      titleEl.textContent = "Start tracking your watched anime to unlock personalized trivia facts!";
      subEl.textContent = "Your anime journey";
      return;
    }
    
    // Using simple regex parse for episodes in case it's a string, or fallback to numeric helper if imported.
    const parseIntSafe = (v) => Number.parseInt(String(v).replace(/[^0-9]/g, '')) || 0;
    const getTitle = (i) => i?.title_english || i?.title || "Untitled";
    
    const facts = [];
    
    const withYear = items.filter(i => Number.isFinite(Number(i.year)) && i.year > 1900).sort((a,b) => Number(a.year) - Number(b.year));
    if (withYear.length) {
      const oldest = withYear[0];
      facts.push({
        text: `Did you know that ${getTitle(oldest)} is the oldest anime in your history from ${oldest.year}?`,
        sub: "From your timeline"
      });
    }
    
    const rated = items.filter(i => i.userRating > 0).sort((a,b) => b.userRating - a.userRating);
    if (rated.length) {
      const best = rated[0];
      facts.push({
        text: `Your highest-rated masterpiece is ${getTitle(best)} at ${best.userRating}/10!`,
        sub: "From your ratings"
      });
    }
    
    const episodic = items.filter(i => parseIntSafe(i.episodes) > 0).sort((a,b) => parseIntSafe(b.episodes) - parseIntSafe(a.episodes));
    if (episodic.length) {
      const longest = episodic[0];
      facts.push({
        text: `${getTitle(longest)} is the longest series you've tracked with ${parseIntSafe(longest.episodes)} episodes!`,
        sub: "Marathon stats"
      });
    }
    
    const top = topGenres(items, 1);
    if (top && top.length) {
      facts.push({
        text: `${top[0][0]} is your most explored genre with ${top[0][1]} titles!`,
        sub: "Genre focus"
      });
    }
    
    if (!facts.length) {
      facts.push({ text: "You're building an excellent taste in anime. Keep tracking!", sub: "Anime stats" });
    }
    
    // Pick the most interesting one or just randomly on this render
    // Let's seed the random by the number of items so it doesn't jitter on every single DOM update unless items change
    const pickIdx = items.length % facts.length;
    const pick = facts[pickIdx];
    
    titleEl.textContent = pick.text;
    subEl.textContent = pick.sub;
  }
  
  const unsub = libraryStore.subscribe(render);
  render();
  return { destroy() { unsub(); } };
}

// ── Studio Spotlight Module ────────────────────────────────────────────────
export function initStudioSpotlight({ libraryStore }) {
  const card = document.getElementById("studio-spotlight-card");
  if (!card) return { render() { }, destroy() { } };

  function render() {
    const items = libraryStore.getAll();
    if (!items.length) {
      card.innerHTML = `
        <div class="studio-spotlight-header">
          <span class="studio-spotlight-badge">Discovery</span>
        </div>
        <div class="studio-brand-name">No Data yet</div>
        <p class="studio-stats">Start tracking anime to reveal your studio spotlight.</p>
        <div class="studio-signature">
          <span class="studio-style-chip">Studios</span>
          <span class="studio-style-chip">Analytics</span>
        </div>
      `;
      return;
    }

    // 1. Count Studios
    const counts = new Map(); // name -> { count, genres: Set, topRated: { score, title } }
    items.forEach(item => {
      const name = item.studio;
      if (!name || name === "Unknown") return;
      
      if (!counts.has(name)) {
        counts.set(name, { count: 0, genres: new Set(), topRated: { score: -1, title: "" } });
      }
      
      const data = counts.get(name);
      data.count++;
      (item.genres || []).forEach(g => data.genres.add(g));
      if (item.score > data.topRated.score) {
        data.topRated = { score: item.score, title: item.title };
      }
    });

    if (!counts.size) {
       card.innerHTML = `<div class="anime-card-meta">Not enough studio data found yet.</div>`;
       return;
    }

    // 2. Find Top Studio
    const topStudio = [...counts.entries()].sort((a,b) => b[1].count - a[1].count)[0];
    const [name, stats] = topStudio;
    
    // 3. Get Signature Style (top 3 genres for this studio)
    const genreArray = [...stats.genres].slice(0, 3);
    
    card.innerHTML = `
      <div class="studio-spotlight-header">
        <span class="studio-spotlight-badge">Studio Spotlight</span>
      </div>
      <div class="studio-brand-name">${escapeHtml(name)}</div>
      <p class="studio-stats">You've watched <strong>${stats.count}</strong> of their series${stats.count > 3 ? ". They are a library staple!" : "."}</p>
      
      <div class="studio-signature">
        ${genreArray.map(g => `<span class="studio-style-chip">${escapeHtml(g)}</span>`).join('')}
      </div>
      
      <div class="studio-top-work">
        <div class="studio-top-work-label">Your Top Rated</div>
        <div class="studio-top-work-title">${escapeHtml(stats.topRated.title || "TBD")}</div>
      </div>
      
      <button type="button" class="studio-explore-btn" title="Explore ${escapeHtml(name)} Library" data-studio-action="explore" data-name="${escapeHtml(name)}">
        <span class="material-icons">search</span>
      </button>
    `;
  }

  function onClick(e) {
    const btn = e.target.closest("[data-studio-action='explore']");
    if (!btn) return;
    const sName = btn.dataset.name;
    window.dispatchEvent(new CustomEvent('Animyx:navigate', { detail: { view: 'search-view', query: sName } }));
    // Also trigger the actual search
    setTimeout(() => {
        const input = document.getElementById("global-search-input");
        if (input) {
            input.value = sName;
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }, 100);
  }

  card.addEventListener("click", onClick);
  const unsub = libraryStore.subscribe(render);
  render();
  return { render, destroy() { unsub(); card.removeEventListener("click", onClick); } };
}

// ── Main Dashboard Facade ───────────────────────────────────────────────────

export function initDashboardModules(ctx) {
  const heroCarousel = typeof initHeroCarousel === 'function' ? initHeroCarousel(ctx) : null;
  const recommendations = initRecommendations(ctx);
  const upcomingWidget = initUpcomingWidget(ctx);
  const clipCard = initClipCard(ctx);
  const milestones = initMilestones(ctx);
  const triviaCard = initTriviaCard(ctx);
  const studioSpotlight = initStudioSpotlight(ctx);

  return Object.freeze({
    heroCarousel, recommendations, upcomingWidget, clipCard, milestones, triviaCard, studioSpotlight,
    render() {
      const state = ctx?.store?.getState?.() || {};
      const libraryItems = ctx?.libraryStore?.getAll?.() || [];
      heroCarousel?.render?.(getTopOngoingAnikoto(state, 10, libraryItems));
      recommendations?.render?.(); upcomingWidget?.render?.(); clipCard?.render?.();
      milestones?.render?.(); triviaCard?.render?.(); studioSpotlight?.render?.();
    },
    destroy() {
      clipCard?.destroy?.(); upcomingWidget?.destroy?.(); recommendations?.destroy?.(); heroCarousel?.destroy?.();
      milestones?.destroy?.(); triviaCard?.destroy?.(); studioSpotlight?.destroy?.();
    }
  });
}

// Re-export insights separate (too large to merge)
export { initInsights } from "./insights.js";
