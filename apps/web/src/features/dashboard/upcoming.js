/**
 * features/dashboard/upcoming.js
 */

import { authFetch, apiUrl } from "../../config.js";
import { escapeHtml } from "./utils.js";

export function initUpcomingWidget({ fetchImpl = fetch.bind(globalThis), storage = globalThis.localStorage, timers = globalThis }) {
  const CACHE_KEY = "animex_dashboard_upcoming_v1";
  const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
  const JIKAN_ENDPOINT = "https://api.jikan.moe/v4/seasons/upcoming?limit=6";
  const BACKEND_ENDPOINT = apiUrl("/anime/upcoming?limit=6");

  const listEl = document.getElementById("dashboard-upcoming-list");
  if (!listEl) return { render() { }, destroy() { } };

  let upcomingTimer = 0;
  let currentItems = [];

  const SKELETON_COUNT = 6;
  const SKELETON_MARKUP = Array(SKELETON_COUNT).fill(0).map(() => `
    <div class="news-item is-skeleton">
      <div class="news-thumb skeleton-thumb"></div>
      <div class="news-badge skeleton-badge"></div>
      <div>
        <h4 class="anime-card-title skeleton-title"></h4>
        <div class="flex items-center gap-1 anime-card-meta skeleton-meta"></div>
      </div>
    </div>
  `).join("");

  function renderRows(items) {
    currentItems = items;
    if (!items.length) {
      listEl.innerHTML = '<div class="tracker-empty">No upcoming anime found.</div>';
      return;
    }
    listEl.innerHTML = items.map(item => {
      const malId = Number(item.mal_id || 0);
      let title = item.title_english;
      if (!title && Array.isArray(item.titles)) {
        const eng = item.titles.find(t => t.type === 'English');
        if (eng) title = eng.title;
      }
      title = String(title || item.title || "Unknown Title");
      const img = String(item.images?.jpg?.image_url || "");
      const date = String(item.aired?.string || "TBA").split("to")[0].trim();
      const studio = Array.isArray(item.studios) && item.studios.length > 0 ? item.studios[0].name : "Unknown Studio";

      return `<div class="news-item upcoming-release-card" data-action="open-anime-modal" data-id="${malId}">
        <div class="news-thumb upcoming-release-poster">
          ${img ? `<img class="news-thumb-img" src="${escapeHtml(img)}" alt="${escapeHtml(title)}" loading="lazy" />` : '<div class="news-thumb-fallback">🎬</div>'}
        </div>
        <div class="upcoming-release-content">
          <h4 class="anime-card-title upcoming-release-title">${escapeHtml(title)}</h4>
          <div class="anime-card-meta upcoming-release-meta">
            <span>${escapeHtml(date)} • ${escapeHtml(studio)}</span>
          </div>
        </div>
        <div class="news-badge news-badge-mal upcoming-release-badge" aria-label="Trending release">
          <span class="material-icons upcoming-release-badge-icon" aria-hidden="true">local_fire_department</span>
        </div>
      </div>`;
    }).join("");
  }

  async function fetchData(url) {
    const controller = new AbortController();
    const timeoutId = timers.setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetchImpl(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`Fetch failed from ${url}`);
      const payload = await res.json();
      return Array.isArray(payload?.data) ? payload.data : [];
    } finally {
      timers.clearTimeout(timeoutId);
    }
  }

  async function loadData({ force = false } = {}) {
    let cachedData = null;
    let cacheExpired = true;
    try {
      const cachedStr = storage?.getItem?.(CACHE_KEY);
      if (cachedStr) {
        const cached = JSON.parse(cachedStr);
        if (Array.isArray(cached.data)) {
          cachedData = cached.data;
          cacheExpired = (Date.now() - cached.ts >= CACHE_TTL_MS);
        }
      }
    } catch (err) { console.error("Error reading upcoming cache:", err); }

    if (cachedData && !force) {
      renderRows(cachedData);
      if (!cacheExpired) return;
    } else { listEl.innerHTML = SKELETON_MARKUP; }

    let items = [];
    let source = "backend";
    try {
      items = await fetchData(BACKEND_ENDPOINT);
    } catch (backendErr) {
      source = "jikan";
      try { items = await fetchData(JIKAN_ENDPOINT); } catch {
        if (!cachedData) listEl.innerHTML = '<div class="anime-card-meta">Unable to load upcoming anime right now.</div>';
        return;
      }
    }

    if (JSON.stringify(items) !== JSON.stringify(currentItems) || listEl.innerHTML === SKELETON_MARKUP) renderRows(items);
    try { storage?.setItem?.(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: items, source })); } catch (e) { console.error("Error writing upcoming cache:", e); }
  }

  void loadData();
  upcomingTimer = timers.setInterval(() => loadData({ force: true }), CACHE_TTL_MS);

  return Object.freeze({
    render() {
      if (!currentItems.length) void loadData();
      else renderRows(currentItems);
    },
    destroy() { if (upcomingTimer) timers.clearInterval(upcomingTimer); }
  });
}
