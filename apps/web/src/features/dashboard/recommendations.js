/**
 * features/dashboard/recommendations.js
 */

import { authFetch, apiUrl } from "../../config.js";
import { escapeHtml, topGenres, topGenresWithOthers, topGenreNames, derivePersonality } from "./utils.js";
import { renderGenreDonut } from "./charts.js";

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

function getGenreConfig(genreName) {
  const norm = String(genreName).toLowerCase().replace(/_/g, " ");
  for (const [key, val] of Object.entries(GENRE_META)) {
    if (norm.includes(key)) return val;
  }
  return { icon: "local_offer", color: "#8b5cf6" };
}

export function initRecommendations({ store, libraryStore, selectors, toast = null }) {
  const dashboardRoot = document.getElementById("dashboard-view") || document;
  const refs = {
    recommendedList: document.getElementById("recommended-list"),
    quickTotal: document.getElementById("quick-total"),
    quickPlan: document.getElementById("quick-plan"),
    quickGenres: document.getElementById("quick-genres"),
    quickTopGenres: document.getElementById("quick-top-genres"),
    personalityName: document.getElementById("anime-personality-name"),
    personalityDesc: document.getElementById("anime-personality-desc"),
    dashboardGenreSvg: document.getElementById("completed-genre-pie"),
    dashboardGenreLegend: dashboardRoot.querySelector(".stats-container .legend")
  };

  let backendRecs = null;

  async function fetchBackendRecs() {
    try {
      const res = await authFetch(apiUrl("/user/me/recommendations"));
      if (!res.ok) return;
      const { data } = await res.json();
      backendRecs = Array.isArray(data) ? data : [];
      if (backendRecs.length > 0) render();
    } catch {
      backendRecs = [];
    }
  }

  function getLocalRecommendations(dataState, libraryItems) {
    const topGenresList = topGenreNames(libraryItems);
    const existingIds = new Set(libraryItems.map((item) => Number(item?.malId || 0)));
    let recs = selectors.getCombinedDiscoveryState(dataState).filter((anime) => !existingIds.has(Number(anime?.malId || 0)));
    if (topGenresList.length) {
      recs = recs.sort((left, right) => {
        const leftMatches = (left?.genres || []).filter((genre) => topGenresList.includes(genre)).length;
        const rightMatches = (right?.genres || []).filter((genre) => topGenresList.includes(genre)).length;
        if (rightMatches !== leftMatches) return rightMatches - leftMatches;
        return Number(right?.score || 0) - Number(left?.score || 0);
      });
    }
    return recs.slice(0, 10);
  }

  function renderRecommendedList(rows) {
    if (!refs.recommendedList) return;
    if (!rows.length) {
      refs.recommendedList.innerHTML = `
        <div class="tracker-empty" style="text-align: center; padding: 2rem 1rem;">
          <span class="material-icons" style="font-size: 2.5rem; color: var(--text-gray-600); margin-bottom: 0.5rem;">auto_awesome</span>
          <p class="anime-card-meta">Add anime to your watchlist to unlock personalized recommendations.</p>
        </div>
      `;
      return;
    }
    refs.recommendedList.innerHTML = rows.map((anime) => {
      const malId = Number(anime?.malId || anime?.mal_id || 0);
      const title = escapeHtml(anime?.title || "Unknown");
      const image = escapeHtml(anime?.image || "https://via.placeholder.com/120x168?text=No+Image");
      const genres = (anime?.genres || []).slice(0, 3).map((g) => escapeHtml(g)).join(", ") || "Genre TBD";

      return `
        <div class="reco-card" data-id="${malId}">
          <div class="reco-thumb-wrap">
            <img class="reco-thumb" src="${image}" alt="${title}">
          </div>
          <div class="reco-body">
            <div class="reco-title" title="${title}">${title}</div>
            <div class="reco-genres">${genres}</div>
            <button class="reco-add-btn" type="button" data-reco-action="add-plan" data-id="${malId}">
              Add to Plan
            </button>
          </div>
        </div>
      `;
    }).join("");
  }

  function render() {
    const dataState = store.getState();
    const libraryItems = libraryStore.getAll();
    const completedItems = libraryItems.filter((item) => String(item?.status || "").toLowerCase() === "completed");
    const stats = libraryStore.getStats();
    const genres = topGenres(libraryItems, 3);
    const personality = derivePersonality(stats);
    const completedGenreEntries = topGenresWithOthers(completedItems, 3);

    if (refs.quickTotal) refs.quickTotal.textContent = String(stats.total);
    if (refs.quickPlan) refs.quickPlan.textContent = String(stats.plan);
    if (refs.quickGenres) refs.quickGenres.textContent = String(genres.length);
    if (refs.personalityName) refs.personalityName.textContent = personality.name;
    if (refs.personalityDesc) refs.personalityDesc.textContent = personality.desc;

    if (refs.quickTopGenres) {
      refs.quickTopGenres.innerHTML = genres.length
        ? genres.map(([genre]) => {
          const conf = getGenreConfig(genre);
          return `<div class="genre-chip" style="--accent: ${conf.color}">
            <span class="material-icons">${conf.icon}</span>
            <span>${escapeHtml(genre)}</span>
          </div>`;
        }).join("")
        : '<span class="anime-card-meta">No genre data yet</span>';
    }

    if (refs.dashboardGenreSvg && refs.dashboardGenreLegend) {
      if (!completedGenreEntries.length) {
        refs.dashboardGenreSvg.innerHTML = `<g transform="translate(100,100)"><circle r="95" fill="none" stroke="rgba(167, 139, 250, 0.14)" stroke-width="20" stroke-dasharray="10 10"></circle><text x="0" y="5" text-anchor="middle" fill="var(--text-muted)" font-size="0.8rem">No Data</text></g>`;
        refs.dashboardGenreLegend.innerHTML = '<div class="anime-card-meta" style="margin-bottom:0; text-align: center; width: 100%;">Complete anime to see distribution.</div>';
      } else {
        renderGenreDonut(refs.dashboardGenreSvg, completedGenreEntries);
        const total = completedGenreEntries.reduce((sum, [, count]) => sum + Number(count || 0), 0);
        const palette = ["var(--chart-purple)", "var(--chart-blue)", "var(--chart-cyan)", "var(--chart-green)", "var(--chart-orange)", "var(--chart-pink)"];
        refs.dashboardGenreLegend.innerHTML = completedGenreEntries.map(([name, count], i) => {
          const pct = Math.round((Number(count || 0) / total) * 100);
          const c = palette[i % palette.length];
          return `<div class="legend-item"><span class="legend-dot" style="background: ${c}"></span><div class="legend-label"><span class="anime-card-meta" style="margin-bottom:0;color:var(--text-primary); font-weight:600;">${escapeHtml(name)}</span><span class="anime-card-meta" style="margin-bottom:0;font-size:0.6rem;">${pct}%</span></div></div>`;
        }).join('');
      }
    }

    const rows = (backendRecs && backendRecs.length > 0)
      ? backendRecs
      : getLocalRecommendations(dataState, libraryItems);

    renderRecommendedList(rows);
  }

  function onRecommendedClick(event) {
    const button = event.target.closest("[data-reco-action='add-plan']");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    const malId = Number(button.getAttribute("data-id") || 0);
    if (!malId) return;
    const state = store.getState();
    const anime = selectors.getCombinedDiscoveryState(state).find((row) => Number(row?.malId || 0) === malId);
    if (!anime) return;
    libraryStore.upsert({ ...anime, status: "plan" }, "plan");
    toast?.show?.("Added to watchlist");
  }

  refs.recommendedList?.addEventListener("click", onRecommendedClick);
  const unsubs = [store.subscribe(render), libraryStore.subscribe(render)];
  render();
  fetchBackendRecs();

  return Object.freeze({
    render,
    destroy() {
      refs.recommendedList?.removeEventListener("click", onRecommendedClick);
      unsubs.forEach((fn) => fn());
    }
  });
}
