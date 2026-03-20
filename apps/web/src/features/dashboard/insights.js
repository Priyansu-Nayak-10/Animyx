/**
 * features/dashboard/insights.js
 */

import { authFetch, apiUrl } from "../../config.js";
import { STATUS } from "../../store.js";
import { renderDonutChart, renderInsightGenreDonut, escapeHtml, describeDonutArc } from "./dashboard.js";

const GENRE_COLOR_MAP = Object.freeze({
  action: "var(--insight-rose)",
  fantasy: "var(--insight-purple)",
  adventure: "var(--insight-cyan)",
  suspense: "var(--insight-violet)",
  comedy: "var(--insight-amber)",
  romance: "var(--insight-pink)",
  "sci-fi": "var(--insight-cyan)",
  mystery: "var(--insight-violet)",
  drama: "var(--insight-orchid)",
  horror: "var(--insight-rose)",
  thriller: "var(--insight-rose)",
  supernatural: "var(--insight-purple)"
});

const GENRE_FALLBACK_COLORS = Object.freeze([
  "var(--insight-purple)",
  "var(--insight-cyan)",
  "var(--insight-pink)",
  "var(--insight-rose)",
  "var(--insight-lavender)",
  "var(--insight-amber)",
  "var(--insight-violet)"
]);

const LEVEL_TITLES = [
  { threshold: 50, title: "Sage of Six Paths" },
  { threshold: 30, title: "Anime Legend" },
  { threshold: 20, title: "Series Specialist" },
  { threshold: 10, title: "Seasoned Viewer" },
  { threshold: 0, title: "Rookie Otaku" }
];

function formatWatchTime(totalMinutes) {
  const mins = Math.max(0, Math.floor(Number(totalMinutes || 0)));
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  return `${hours}h ${rest}m`;
}

function parseDurationMinutes(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value || "").toLowerCase();
  const minutes = text.match(/(\d+)\s*min/);
  if (minutes) return Number(minutes[1]) || 24;
  const hours = text.match(/(\d+)\s*hr/);
  if (hours) return (Number(hours[1]) || 0) * 60;
  return 24;
}

function toDateKey(timestamp) {
  const date = new Date(Number(timestamp || 0));
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function calculateCompletionStreak(timestamps) {
  const uniqueDays = [...new Set((timestamps || []).map(toDateKey).filter(Boolean))].sort().reverse();
  if (!uniqueDays.length) return 0;
  let streak = 1;
  let cursor = new Date(uniqueDays[0]).getTime();
  for (let i = 1; i < uniqueDays.length; i += 1) {
    const current = new Date(uniqueDays[i]).getTime();
    if ((cursor - current) === (24 * 60 * 60 * 1000)) {
      streak += 1;
      cursor = current;
    } else break;
  }
  return streak;
}

function normalizeGenreNames(value) {
  return (Array.isArray(value) ? value : [])
    .map((genre) => (typeof genre === "string" ? genre : genre?.name))
    .map((genre) => String(genre || "").trim())
    .filter(Boolean);
}

function normalizeStudioName(item) {
  if (typeof item?.studio === "string" && item.studio.trim()) return item.studio.trim();
  const studios = Array.isArray(item?.studios) ? item.studios : [];
  const firstStudio = studios.find((studio) => (typeof studio === "string" ? studio.trim() : studio?.name));
  const studioName = typeof firstStudio === "string" ? firstStudio : firstStudio?.name;
  return String(studioName || "").trim();
}

function humanizeStatus(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "Updated";
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function getGenreColor(genreName, index = 0) {
  const key = String(genreName || "").trim().toLowerCase();
  if (GENRE_COLOR_MAP[key]) return GENRE_COLOR_MAP[key];
  return GENRE_FALLBACK_COLORS[index % GENRE_FALLBACK_COLORS.length];
}

function getEntryRating(item) {
  const candidates = [Number(item?.userRating), Number(item?.rating), Number(item?.score)];
  return candidates.find((value) => Number.isFinite(value) && value > 0) || 0;
}

function pickTopCount(map) {
  const rows = Object.entries(map || {});
  if (!rows.length) return "No data";
  rows.sort((a, b) => b[1] - a[1]);
  return rows[0]?.[0] || "No data";
}

function calculatePlayerStats(episodes, completed) {
  const xp = (episodes * 12) + (completed * 150);
  const level = Math.floor(Math.sqrt(xp / 100)) || 1;
  const currentLevelXp = Math.pow(level, 2) * 100;
  const nextLevelXp = Math.pow(level + 1, 2) * 100;
  const progress = ((xp - currentLevelXp) / (nextLevelXp - currentLevelXp)) * 100;
  const title = LEVEL_TITLES.find(t => level >= t.threshold)?.title || "Rookie Otaku";
  return { level, title, xp, nextLevelXp: Math.floor(nextLevelXp), progress: Math.min(100, Math.max(0, progress)) };
}

function startOfWeek(date) {
  const dayIndex = (date.getDay() + 6) % 7;
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - dayIndex);
  return start;
}

function formatWeekLabel(startDate) {
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 6);
  const startLabel = startDate.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const endLabel = endDate.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${startLabel} \u2013 ${endLabel}`;
}

function buildWeeklyTooltipHtml(label, watching, completed, planning) {
  const lines = [];
  lines.push(`<div class="tooltip-header">${escapeHtml(label)}</div>`);
  const watchingTotal = watching?.totalEpisodes || 0;
  const completedTotal = completed?.totalAnime || 0;
  const planningTotal = planning?.totalAnime || 0;
  if (watchingTotal > 0) lines.push(`<div class="tooltip-row"><span class="tooltip-indicator watch"></span><span>${watchingTotal} episodes watched</span></div>`);
  if (completedTotal > 0) lines.push(`<div class="tooltip-row"><span class="tooltip-indicator complete"></span><span>${completedTotal} series finished</span></div>`);
  if (planningTotal > 0) lines.push(`<div class="tooltip-row"><span class="tooltip-indicator plan"></span><span>${planningTotal} added to plan</span></div>`);
  return lines.join("");
}

function renderWeeklyActivityChart(container, items) {
  if (!container) return;
  const now = new Date();
  const currentWeekStart = startOfWeek(now);
  const firstWeekStart = new Date(currentWeekStart);
  firstWeekStart.setDate(firstWeekStart.getDate() - 7 * 11);
  const weekBuckets = Array.from({ length: 12 }, (_, index) => {
    const weekStart = new Date(firstWeekStart);
    weekStart.setDate(weekStart.getDate() + index * 7);
    return {
      weekStart,
      label: formatWeekLabel(weekStart),
      watching: { totalEpisodes: 0, titles: [] },
      completed: { totalAnime: 0, titles: [] },
      planning: { totalAnime: 0, titles: [] }
    };
  });
  const startMs = firstWeekStart.getTime();
  const endMs = new Date(currentWeekStart.getTime() + 6 * 24 * 60 * 60 * 1000).getTime();
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;

  items.forEach((item) => {
    const updatedAt = Number(item?.updatedAt || 0);
    const completedAt = Number(item?.completedAt || 0);
    const watchProgressAt = Number(item?.watchProgressAt || 0) || updatedAt;
    const watchlistAddedAt = Number(item?.watchlistAddedAt || 0) || (String(item?.status || "").toLowerCase() === "plan" ? updatedAt : 0);
    const title = String(item?.title || "Unknown");
    [
      { ts: watchProgressAt, type: 'watching', title, episodes: 1 },
      { ts: completedAt, type: 'completed', title },
      { ts: watchlistAddedAt, type: 'planning', title }
    ].forEach(e => {
      if (!e.ts || e.ts < startMs || e.ts > endMs) return;
      const idx = Math.floor((e.ts - startMs) / msPerWeek);
      if (idx < 0 || idx >= weekBuckets.length) return;
      const week = weekBuckets[idx];
      if (e.type === 'watching') {
        week.watching.totalEpisodes += e.episodes;
        const row = week.watching.titles.find(r => r.title === title);
        if (row) row.episodes += e.episodes; else week.watching.titles.push({ title, episodes: e.episodes });
      } else {
        week[e.type].totalAnime += 1;
        week[e.type].titles.push(title);
      }
    });
  });

  const totals = weekBuckets.map(w => ({ ...w, total: w.watching.totalEpisodes + w.completed.totalAnime + w.planning.totalAnime }));
  const maxTotal = Math.max(1, ...totals.map(w => w.total));
  const totalActivity = totals.reduce((sum, w) => sum + w.total, 0);
  const mostActive = totals.reduce((best, w) => (w.total > best.total ? w : best), totals[0]);
  let currentStreakWeeks = 0;
  for (let i = totals.length - 1; i >= 0; i -= 1) { if (totals[i].total <= 0) break; currentStreakWeeks += 1; }

  const mostActiveText = mostActive?.total ? `${mostActive.label} (${mostActive.total} updates)` : "No activity yet";

  function buildRows(mode = "absolute") {
    return totals.map((week, index) => {
      const total = week.total;
      const barScale = mode === "normalized" ? (total > 0 ? 100 : 0) : (total ? (total / maxTotal) * 100 : 0);
      const tooltipHtml = buildWeeklyTooltipHtml(week.label, week.watching, week.completed, week.planning);
      const barDelay = Math.min(index * 70, 700);
      const segment = (value, className) => {
        if (!total || !value) return "";
        const height = (value / total) * 100;
        return `<span class="activity-segment ${className}" style="height:${height}%" data-tooltip-html="${escapeHtml(tooltipHtml)}"></span>`;
      };
      return `
        <div class="activity-column${total ? "" : " is-empty"}">
          <div class="activity-total-float">${total}</div>
          <div class="activity-bar-vertical">
            <div class="activity-bar-fill" style="height:${barScale}%; --bar-delay:${barDelay}ms">
              ${segment(week.watching.totalEpisodes, "segment-watch")}
              ${segment(week.completed.totalAnime, "segment-complete")}
              ${segment(week.planning.totalAnime, "segment-planning")}
            </div>
          </div>
          <div class="activity-count">${total ? total : "-"}</div>
          <div class="activity-label">${escapeHtml(week.label)}</div>
        </div>
      `;
    }).join("");
  }

  container.innerHTML = `
    <div class="insight-activity-chart" data-activity-mode="absolute">${buildRows("absolute")}</div>
    <div class="activity-summary">
      <div class="activity-summary-item"><span class="summary-label">Most Active Week</span><span class="summary-value">${escapeHtml(mostActiveText)}</span></div>
      <div class="activity-summary-item"><span class="summary-label">Total Activity</span><span class="summary-value">${totalActivity}</span></div>
      <div class="activity-summary-item"><span class="summary-label">Current Streak</span><span class="summary-value">${currentStreakWeeks} week${currentStreakWeeks === 1 ? "" : "s"}</span></div>
    </div>
  `;

  const chart = container.querySelector(".insight-activity-chart");
  const panel = container.closest(".activity-chart-panel");
  const toggleButtons = panel?.querySelectorAll("[data-activity-mode]");
  if (chart && toggleButtons?.length) {
    toggleButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const mode = btn.getAttribute("data-activity-mode") || "absolute";
        toggleButtons.forEach((node) => node.classList.toggle("is-active", node === btn));
        chart.setAttribute("data-activity-mode", mode);
        chart.innerHTML = buildRows(mode);
      });
    });
  }
}

function renderPersonaRadar(svg, genreCount) {
  if (!svg) return;
  const dimensions = [
    { label: "Action", keys: ["Action", "Adventure", "Sports"] },
    { label: "Intellect", keys: ["Mystery", "Psychological", "Sci-Fi", "Suspense"] },
    { label: "Emotion", keys: ["Drama", "Romance", "Slice of Life"] },
    { label: "Wit", keys: ["Comedy", "Parody"] },
    { label: "Wonder", keys: ["Fantasy", "Supernatural", "Magic"] }
  ];
  const scores = dimensions.map(d => Math.min(100, (d.keys.reduce((s, k) => s + (genreCount[k] || 0), 0) * 20)));
  const cx = 100, cy = 100, r = 70;
  const angleStep = (Math.PI * 2) / dimensions.length;

  let gridHtml = [20, 40, 60, 80, 100].map(level => {
    const points = dimensions.map((_, i) => `${cx + (r * level / 100) * Math.cos(i * angleStep - Math.PI / 2)},${cy + (r * level / 100) * Math.sin(i * angleStep - Math.PI / 2)}`).join(" ");
    return `<polygon points="${points}" class="radar-grid-line" />`;
  }).join("");

  const axesHtml = dimensions.map((d, i) => {
    const x = cx + r * Math.cos(i * angleStep - Math.PI / 2), y = cy + r * Math.sin(i * angleStep - Math.PI / 2);
    const lx = cx + (r + 15) * Math.cos(i * angleStep - Math.PI / 2), ly = cy + (r + 15) * Math.sin(i * angleStep - Math.PI / 2);
    return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" class="radar-axis-line" /><text x="${lx}" y="${ly}" class="radar-label" text-anchor="middle" alignment-baseline="middle">${d.label}</text>`;
  }).join("");

  const polyPoints = scores.map((s, i) => `${cx + (r * Math.max(10, s) / 100) * Math.cos(i * angleStep - Math.PI / 2)},${cy + (r * Math.max(10, s) / 100) * Math.sin(i * angleStep - Math.PI / 2)}`).join(" ");
  svg.innerHTML = `${gridHtml}${axesHtml}<polygon points="${polyPoints}" class="radar-polygon" />`;

  const personaType = { "Action": "The Adrenaline Seeker", "Intellect": "The Strategic Mind", "Emotion": "The Soul Searcher", "Wit": "The Joy Bringer", "Wonder": "The Dream Weaver" }[dimensions[scores.indexOf(Math.max(...scores))].label] || "Balanced Explorer";
  const personaEl = document.getElementById("insight-persona-type");
  if (personaEl) personaEl.textContent = personaType;
}

function renderStudioSpotlight(container, studioCount, items) {
  if (!container) return;
  const studioRatings = {};
  items.forEach(item => {
    const studio = String(item.studio || "").trim();
    if (!studio) return;
    const rating = getEntryRating(item);
    if (rating > 0) {
      if (!studioRatings[studio]) studioRatings[studio] = [];
      studioRatings[studio].push(rating);
    }
  });
  const sortedStudios = Object.entries(studioCount).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count], idx) => {
    const ratings = studioRatings[name] || [];
    const avg = ratings.length ? (ratings.reduce((s, r) => s + r, 0) / ratings.length).toFixed(1) : "N/A";
    return `<div class="studio-chip"><span class="studio-rank">#${idx + 1}</span><div class="studio-info"><div class="studio-name">${escapeHtml(name)}</div><div class="studio-rating">${count} anime • ${avg} avg rating</div></div></div>`;
  }).join("");
  container.innerHTML = sortedStudios || '<p class="anime-card-meta">Watch more anime to spotlight studios.</p>';
}

function calculateInsights(items) {
  const rows = (items || []).map((item) => ({ ...item, genres: normalizeGenreNames(item?.genres), studio: normalizeStudioName(item) }));
  let totalEpisodesWatched = 0, totalWatchMinutes = 0;
  const ratingValues = [], studioCount = {}, genreCount = {}, recentActivity = [], completedRows = [];
  let lastCompletedAnime = null;

  rows.forEach((item) => {
    const watchedEpisodes = Math.max(0, Number(item?.watchedEpisodes ?? item?.progress ?? 0));
    totalEpisodesWatched += watchedEpisodes;
    totalWatchMinutes += watchedEpisodes * parseDurationMinutes(item?.duration);
    const entryRating = getEntryRating(item); if (entryRating > 0) ratingValues.push(entryRating);
    const studio = String(item?.studio || "").trim(); if (studio) studioCount[studio] = (studioCount[studio] || 0) + 1;

    if (item?.status === STATUS.COMPLETED) {
      completedRows.push(item);
      item.genres.forEach((genre) => { const key = String(genre || "").trim(); if (key) genreCount[key] = (genreCount[key] || 0) + 1; });
      const completedAt = Number(item?.completedAt || 0);
      if (completedAt > 0 && (!lastCompletedAnime || completedAt > lastCompletedAnime.completedAt)) lastCompletedAnime = { title: String(item?.title || "Unknown"), completedAt };
    }
    const eventTime = item?.status === STATUS.COMPLETED ? Number(item?.completedAt || 0) : Number(item?.updatedAt || 0);
    if (eventTime > 0) recentActivity.push({ title: String(item?.title || "Unknown"), status: humanizeStatus(item?.status), timestamp: eventTime });
  });

  const breakdown = { completed: rows.filter((i) => i.status === STATUS.COMPLETED).length, watching: rows.filter((i) => i.status === STATUS.WATCHING).length, plan: rows.filter((i) => i.status === STATUS.PLAN).length };
  if (!Object.keys(genreCount).length) rows.forEach(i => i.genres.forEach(g => genreCount[g] = (genreCount[g] || 0) + 1));
  const sortedGenres = Object.entries(genreCount).sort((a, b) => b[1] - a[1]);
  const otherCount = Math.max(0, sortedGenres.reduce((s, [, c]) => s + c, 0) - sortedGenres.slice(0, 3).reduce((s, [, c]) => s + c, 0));

  return {
    totalEpisodesWatched, estimatedWatchTime: formatWatchTime(totalWatchMinutes), averageUserRating: ratingValues.length ? (ratingValues.reduce((s, v) => s + v, 0) / ratingValues.length).toFixed(1) : "0.0",
    totalCompleted: breakdown.completed, totalWatching: breakdown.watching, totalPlan: breakdown.plan, completionStreak: calculateCompletionStreak(completedRows.map(i => Number(i.completedAt || 0))),
    favoriteStudio: pickTopCount(studioCount), lastCompletedAnime: lastCompletedAnime?.title || "No data", statusBreakdown: breakdown, genreDistribution: { sorted: otherCount > 0 ? [...sortedGenres.slice(0, 3), ["Others", otherCount]] : sortedGenres.slice(0, 3), otherCount, all: genreCount },
    recentActivity: recentActivity.sort((a, b) => b.timestamp - a.timestamp), playerStats: calculatePlayerStats(totalEpisodesWatched, breakdown.completed), studioCount
  };
}

function renderDiscoveryIntelligence(refs, genreDistribution) {
  const allGenres = ["Action", "Adventure", "Comedy", "Drama", "Fantasy", "Mystery", "Psychological", "Romance", "Sci-Fi", "Slice of Life", "Sports", "Supernatural", "Suspense", "Thriller"];
  const missing = allGenres.filter(g => !Object.keys(genreDistribution.all || {}).includes(g));
  if (refs.gapsText) refs.gapsText.textContent = missing.length ? `You haven't explored ${missing.slice(0, 2).join(" or ")} much. Try diving into these!` : "You're a versatile viewer!";
  const sorted = genreDistribution.sorted.filter(g => g[0] !== "Others");
  if (refs.suggestedGenre) {
    const suggestions = { "Action": "Cyberpunk", "Comedy": "Slice of Life", "Drama": "Psychological", "Fantasy": "Isekai", "Romance": "Shoujo", "Sci-Fi": "Mecha" };
    refs.suggestedGenre.textContent = sorted.length ? `Based on ${sorted[0][0]}, try ${suggestions[sorted[0][0]] || "Classic Masterpieces"} next.` : "Watch more for suggestions!";
  }
}

export function initInsights({ libraryStore }) {
  const refs = {
    view: document.getElementById("insights-view"), emptyOverlay: document.getElementById("insights-empty-overlay"),
    watchTime: document.getElementById("insight-watch-time"), averageRating: document.getElementById("insight-average-rating"),
    episodesWatched: document.getElementById("insight-episodes-watched"), completed: document.getElementById("insight-completed"),
    watching: document.getElementById("insight-watching"), plan: document.getElementById("insight-plan"),
    statusChart: document.getElementById("insight-status-chart"), genreChart: document.getElementById("insight-genre-chart"),
    genreAnalysisText: document.getElementById("insight-genre-analysis-text"), topGenres: document.getElementById("insight-top-genres"),
    recentActivity: document.getElementById("insight-recent-activity"), siCountCompleted: document.getElementById("si-count-completed"),
    siCountWatching: document.getElementById("si-count-watching"), siCountPlan: document.getElementById("si-count-plan"),
    longestStreak: document.getElementById("insight-longest-streak"), topGenreStat: document.getElementById("insight-top-genre-stat"),
    completionRate: document.getElementById("insight-completion-rate"), avgRatingSi: document.getElementById("insight-avg-rating-si"),
    levelTitle: document.getElementById("insight-level-title"), levelNumber: document.getElementById("insight-level-number"),
    xpCurrent: document.getElementById("insight-xp-current"), xpNext: document.getElementById("insight-xp-next"), xpBar: document.getElementById("insight-xp-bar"),
    weeklyActivity: document.getElementById("insight-activity-chart"), radarSvg: document.getElementById("insight-persona-radar"),
    studioList: document.getElementById("insight-studio-list"), favoriteStudio: document.getElementById("insight-favorite-studio"),
    lastCompletedAnime: document.getElementById("insight-last-completed"), gapsText: document.getElementById("insight-gaps-text"), suggestedGenre: document.getElementById("insight-suggested-genre")
  };

  function render() {
    const items = libraryStore.getAll();
    if (!items?.length) { 
      refs.view?.classList.add("is-empty"); if (refs.emptyOverlay) refs.emptyOverlay.hidden = false;
      renderDonutChart(refs.statusChart, [], 0, "", false); renderInsightGenreDonut(refs.genreChart, []); return;
    }
    refs.view?.classList.remove("is-empty"); if (refs.emptyOverlay) refs.emptyOverlay.hidden = true;
    const insights = calculateInsights(items);
    if (refs.watchTime) refs.watchTime.textContent = insights.estimatedWatchTime;
    if (refs.averageRating) refs.averageRating.textContent = insights.averageUserRating;
    if (refs.episodesWatched) refs.episodesWatched.textContent = String(insights.totalEpisodesWatched);
    const ps = insights.playerStats;
    if (refs.levelTitle) refs.levelTitle.textContent = ps.title; if (refs.levelNumber) refs.levelNumber.textContent = `Level ${ps.level}`;
    if (refs.xpCurrent) refs.xpCurrent.textContent = String(ps.xp); if (refs.xpNext) refs.xpNext.textContent = String(ps.nextLevelXp); if (refs.xpBar) refs.xpBar.style.width = `${ps.progress}%`;
    renderWeeklyActivityChart(refs.weeklyActivity, items); renderPersonaRadar(refs.radarSvg, insights.genreDistribution.all); renderStudioSpotlight(refs.studioList, insights.studioCount, items); renderDiscoveryIntelligence(refs, insights.genreDistribution);
    const breakdown = insights.statusBreakdown;
    if (refs.siCountCompleted) refs.siCountCompleted.textContent = String(breakdown.completed);
    if (refs.siCountWatching) refs.siCountWatching.textContent = String(breakdown.watching);
    if (refs.siCountPlan) refs.siCountPlan.textContent = String(breakdown.plan);
    const totalLib = (breakdown.completed || 0) + (breakdown.watching || 0) + (breakdown.plan || 0);
    const completionPct = totalLib > 0 ? Math.round(((breakdown.completed || 0) / totalLib) * 100) : 0;
    if (refs.completionRate) refs.completionRate.textContent = `${completionPct}%`;
    renderDonutChart(refs.statusChart, [
      { label: "Completed", value: breakdown.completed, color: "var(--insight-purple)" },
      { label: "Watching", value: breakdown.watching, color: "var(--insight-cyan)" },
      { label: "Plan", value: breakdown.plan, color: "var(--insight-lavender)" }
    ], totalLib, `${completionPct}%`, false);
    renderInsightGenreDonut(refs.genreChart, insights.genreDistribution.sorted);
    if (refs.topGenres) {
      const genreData = insights.genreDistribution.sorted;
      const max = Math.max(...genreData.map(([, count]) => Number(count || 0)));
      refs.topGenres.innerHTML = genreData.map(([genre, count], idx) => {
        const width = Math.max(18, Math.round((Number(count || 0) / Math.max(1, max)) * 100));
        return `<div class="genre-bar-item"><div class="genre-label">${escapeHtml(genre)}</div><div class="genre-track"><div class="genre-fill" style="width:${width}%;"></div></div><div class="genre-count">${count}</div></div>`;
      }).join("");
    }
  }

  const unsubscribe = libraryStore.subscribe(render);
  render();
  return Object.freeze({ render, destroy() { unsubscribe(); } });
}
