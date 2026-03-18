import { STATUS } from "../../store.js";
import { resolveEpisodes, resolveEpisodesNumeric } from "../../core/utils.js";

const TYPE_FILTERS = Object.freeze({
  ALL: "all",
  MOVIES: "movies",
  SERIES: "series"
});
const STATUS_DROPPED = STATUS.DROPPED || "dropped";
const STATUS_FILTERS = Object.freeze({
  ALL: "all",
  WATCHING: STATUS.WATCHING,
  PLAN: STATUS.PLAN,
  DROPPED: STATUS_DROPPED
});
const WATCHLIST_LARGE_LIST_THRESHOLD = 100;
const WATCHLIST_RENDER_CHUNK_SIZE = 40;
const COMPLETED_LARGE_LIST_THRESHOLD = 100;
const COMPLETED_RENDER_CHUNK_SIZE = 50;

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeTitle(item) {
  // Prefer English title using the same priority logic as the rest of the app:
  // title_english → titles[English] → title (romaji) → title_japanese
  const resolved = getDisplayTitle(item);
  return resolved && resolved !== "Unknown Title" ? resolved : String(item?.title || "Unknown");
}

function filterByType(items, typeFilter) {
  if (typeFilter === TYPE_FILTERS.MOVIES) return items.filter((item) => String(item?.type || "").toLowerCase() === "movie");
  if (typeFilter === TYPE_FILTERS.SERIES) return items.filter((item) => String(item?.type || "").toLowerCase() === "tv");
  return items;
}

function sortAZ(items, ascending = true) {
  const sorted = [...items].sort((left, right) => normalizeTitle(left).localeCompare(normalizeTitle(right)));
  return ascending ? sorted : sorted.reverse();
}

function applyTypeAndSort(items, typeFilter, sortAscending) {
  return sortAZ(filterByType(items, typeFilter), sortAscending);
}

function sortRecent(items) {
  return [...items].sort((a, b) => Number(b?.updatedAt || 0) - Number(a?.updatedAt || 0));
}

function getLibraryItemSnapshot(libraryStore, malId) {
  const row = libraryStore?.getAll?.().find((entry) => Number(entry?.malId || 0) === Number(malId || 0));
  if (!row) return null;
  return {
    malId: Number(row.malId || 0),
    title: row.title || "",
    title_english: row.title_english || "",
    titles: Array.isArray(row.titles) ? row.titles : [],
    image: row.image || "",
    status: String(row.status || ""),
    progress: Number(row.progress || 0),
    watchedEpisodes: Number(row.watchedEpisodes || 0),
    userRating: row.userRating ?? null
  };
}

function ensureUndoBar() {
  let bar = document.getElementById("Animyx-undo-bar");
  if (bar && bar.isConnected) return bar;
  bar = document.createElement("div");
  bar.id = "Animyx-undo-bar";
  bar.className = "Animyx-undo-bar";
  bar.innerHTML = `
    <div class="Animyx-undo-inner">
      <span class="Animyx-undo-text" id="Animyx-undo-text"></span>
      <button class="Animyx-undo-btn" type="button" id="Animyx-undo-btn">Undo</button>
      <button class="Animyx-undo-close" type="button" id="Animyx-undo-close" aria-label="Dismiss">×</button>
    </div>
  `;
  document.body.appendChild(bar);
  return bar;
}

function showUndo({ message, onUndo }) {
  const bar = ensureUndoBar();
  const text = bar.querySelector("#Animyx-undo-text");
  const undoBtn = bar.querySelector("#Animyx-undo-btn");
  const closeBtn = bar.querySelector("#Animyx-undo-close");
  if (text) text.textContent = String(message || "Updated");

  // Clear previous handlers by cloning (simple + safe)
  const freshUndoBtn = undoBtn?.cloneNode(true);
  const freshCloseBtn = closeBtn?.cloneNode(true);
  if (undoBtn && freshUndoBtn) undoBtn.replaceWith(freshUndoBtn);
  if (closeBtn && freshCloseBtn) closeBtn.replaceWith(freshCloseBtn);

  let hideId = 0;
  const hide = () => {
    bar.classList.remove("is-open");
    if (hideId) clearTimeout(hideId);
  };

  const undoHandler = () => {
    try { onUndo?.(); } catch (_) {}
    hide();
  };

  freshUndoBtn?.addEventListener("click", undoHandler, { once: true });
  freshCloseBtn?.addEventListener("click", hide, { once: true });

  bar.classList.add("is-open");
  hideId = setTimeout(hide, 5500);
}

function initWatchlistBoard({ libraryStore, toast = null }) {
  const watchlistBoard = document.getElementById("watchlist-board");
  const premiumWatchingContainer = document.getElementById("premium-watching-container");
  const continueStrip = document.getElementById("continue-watching-strip");
  const continueCount = document.getElementById("continue-watching-count");
  const continueNav = document.getElementById("continue-watching-nav");
  const continuePrev = document.getElementById("continue-watching-prev");
  const continueNext = document.getElementById("continue-watching-next");
  const recentStrip = document.getElementById("recent-updates-strip");
  if (!watchlistBoard) return { render() { }, destroy() { } };
  const sectionRoot = watchlistBoard.parentElement || watchlistBoard;

  const uiState = {
    typeFilter: TYPE_FILTERS.ALL,
    statusFilter: STATUS_FILTERS.ALL,
    sortAsc: true,
    sortMode: "az",
    selectMode: false
  };
  const selected = new Set();
  let watchlistStatusMemory = new Map();
  let renderSeq = 0;
  let chunkFrameId = 0;
  let continueIndex = 0;

  function getWatchlistCandidates() {
    const rows = libraryStore
      .getAll()
      .filter((item) => {
        const status = String(item?.status || "").toLowerCase();
        return item?.malId && [STATUS.PLAN, STATUS.WATCHING, STATUS_DROPPED].includes(status);
      });
    if (uiState.statusFilter === STATUS_FILTERS.ALL) return rows;
    if (uiState.statusFilter === STATUS_FILTERS.WATCHING) {
      return rows.filter((item) => [STATUS.WATCHING, STATUS.PLAN].includes(String(item?.status || "").toLowerCase()));
    }
    return rows.filter((item) => String(item?.status || "").toLowerCase() === uiState.statusFilter);
  }

  function getRows() {
    const filtered = filterByType(getWatchlistCandidates(), uiState.typeFilter);
    if (uiState.sortMode === "recent") return sortRecent(filtered);
    return sortAZ(filtered, uiState.sortAsc);
  }

  function buildToolbar() {
    const isAsc = Boolean(uiState.sortAsc);
    const sortMode = uiState.sortMode === "recent" ? "recent" : "az";
    const selectCount = selected.size;
    const selectLabel = uiState.selectMode ? `Selected: ${selectCount}` : "Select";
    return `<div class="watchlist-command-bar" data-watchlist-toolbar="1">
      <div class="watchlist-controls-group">
        <button class="wl-filter ${uiState.typeFilter === TYPE_FILTERS.ALL ? "active" : ""}" data-watchlist-action="set-type" data-type="${TYPE_FILTERS.ALL}">All</button>
        <button class="wl-filter ${uiState.typeFilter === TYPE_FILTERS.MOVIES ? "active" : ""}" data-watchlist-action="set-type" data-type="${TYPE_FILTERS.MOVIES}">Movies</button>
        <button class="wl-filter ${uiState.typeFilter === TYPE_FILTERS.SERIES ? "active" : ""}" data-watchlist-action="set-type" data-type="${TYPE_FILTERS.SERIES}">Series</button>
      </div>
      <div class="watchlist-controls-group">
        <button class="wl-control-btn ${sortMode === "az" ? "active" : ""}" data-watchlist-action="set-sort" data-sort="az">A-Z ${isAsc ? "↑" : "↓"}</button>
        <button class="wl-control-btn ${sortMode === "recent" ? "active" : ""}" data-watchlist-action="set-sort" data-sort="recent">Recent</button>
        <button class="wl-control-btn" data-watchlist-action="random-pick">Pick Something For Me</button>
      </div>
      <div class="watchlist-controls-group">
        <button class="watchlist-chip ${uiState.statusFilter === STATUS_FILTERS.WATCHING ? "active" : ""}" data-watchlist-action="set-status-filter" data-status-filter="${STATUS_FILTERS.WATCHING}" data-drop-status="${STATUS.WATCHING}">Watching</button>
        <button class="watchlist-chip ${uiState.statusFilter === STATUS_FILTERS.DROPPED ? "active" : ""}" data-watchlist-action="set-status-filter" data-status-filter="${STATUS_FILTERS.DROPPED}" data-drop-status="${STATUS_DROPPED}">Dropped</button>
        <button class="watchlist-chip ${uiState.statusFilter === STATUS_FILTERS.ALL ? "active" : ""}" data-watchlist-action="set-status-filter" data-status-filter="${STATUS_FILTERS.ALL}">All</button>
      </div>
      <div class="watchlist-controls-group">
        <button class="wl-control-btn ${uiState.selectMode ? "active" : ""}" data-watchlist-action="toggle-select-mode">${escapeHtml(selectLabel)}</button>
        ${uiState.selectMode ? `<button class="wl-control-btn" data-watchlist-action="clear-selection">Clear</button>` : ""}
      </div>
    </div>`;
  }

  function applyCardAnimations() {
    const cards = watchlistBoard.querySelectorAll(".wl-card-vertical");
    cards.forEach((card, index) => {
      card.style.animationDelay = `${index * 0.05}s`;
    });
  }

  // Track which anime is currently rendered to skip full rebuilds on progress-only updates
  let _pwcRenderedMalId = null;

  function getBannerText(percent) {
    if (percent >= 100) return "You finished all episodes.<br>Ready to mark it complete?";
    if (percent >= 80) return "Almost done.<br>One final push!";
    if (percent >= 50) return "You're halfway there.<br>Stay consistent.";
    if (percent >= 1) return "Good start - keep going!<br>Momentum is building.";
    return "Your journey begins now.<br>Let's start strong.";
  }

  function renderPremiumWatchingCard() {
    if (!premiumWatchingContainer) return;
    const watching = libraryStore.getByStatus(STATUS.WATCHING);

    if (!watching.length) {
      _pwcRenderedMalId = null;
      premiumWatchingContainer.innerHTML = `
        <div class="card premium-watching-card">
          <div class="watching-empty">
            <span class="empty-icon material-icons" aria-hidden="true">tv_off</span>
            <p>No anime in progress</p>
            <span>Start watching to track progress</span>
          </div>
        </div>
      `;
      return;
    }

    const anime = watching[0];
    const malId = Number(anime?.malId || 0);
    const total = resolveEpisodesNumeric(anime?.episodes);
    const watched = Math.max(0, Number(anime?.progress || 0));
    // For the progress ring we need a numeric denominator; if unknown, cap at watched (100%)
    const safeTotal = total > 0 ? total : Math.max(1, watched);
    const percent = Math.min(100, Math.round((watched / safeTotal) * 100));
    const isCompleteReady = percent === 100;
    const totalDisplay = resolveEpisodes(anime?.episodes, anime?.status);
    const pctClass = `pwc-pct-${percent >= 80 ? 'high' : percent >= 50 ? 'mid' : 'low'}`;

    // ── In-place update: same anime, card already rendered ──────────────────
    if (_pwcRenderedMalId === malId && premiumWatchingContainer.querySelector('.pwc-current')) {
      const elCurrent = premiumWatchingContainer.querySelector('.pwc-current');
      const elRingFill = premiumWatchingContainer.querySelector('.pwc-ring-fill');
      const elPct = premiumWatchingContainer.querySelector('.pwc-percentage');
      const elBannerCopy = premiumWatchingContainer.querySelector('.pwc-banner-copy');
      const elFinishBtn = premiumWatchingContainer.querySelector('.pwc-finish-btn');

      if (elCurrent) elCurrent.textContent = String(watched);
      if (elRingFill) elRingFill.setAttribute('stroke-dasharray', `${percent}, 100`);
      if (elPct) {
        elPct.textContent = `${percent}%`;
        elPct.className = `pwc-percentage ${pctClass}`;
      }
      if (elBannerCopy) elBannerCopy.innerHTML = getBannerText(percent);
      if (elFinishBtn) {
        if (isCompleteReady) elFinishBtn.removeAttribute('disabled');
        else elFinishBtn.setAttribute('disabled', '');
      }
      return;
    }

    // ── Full build: first render or anime switched ──────────────────────────
    _pwcRenderedMalId = malId;
    const title = escapeHtml(normalizeTitle(anime));
    const poster = escapeHtml(String(anime?.image || ""));

    premiumWatchingContainer.innerHTML = `
      <div class="card premium-watching-card">
        <div class="pwc-content-wrapper">
          <div class="pwc-poster-wrap">
            <img src="${poster}" alt="${title}" class="pwc-poster" loading="lazy" />
          </div>
          <div class="pwc-info-group">
            <span class="pwc-meta-label">CURRENTLY WATCHING</span>
            <h4 class="pwc-title">${title}</h4>
            <div class="pwc-controls-section">
              <span class="pwc-watched-label">Watched:</span>
              <div class="pwc-progress-row">
                <div class="pwc-pill-counter">
                  <span class="pwc-current">${watched}</span>
                  <span class="pwc-divider">/</span>
                  <span class="pwc-total">${totalDisplay}</span>
                </div>
                <div class="pwc-action-group">
                  <button class="pwc-btn-minus" type="button" data-watchlist-action="progress-dec" data-id="${malId}" aria-label="Decrease progress"><span class="material-icons">remove</span></button>
                  <button class="pwc-btn-plus"  type="button" data-watchlist-action="progress-inc" data-id="${malId}" aria-label="Increase progress"><span class="material-icons">add</span></button>
                  <div class="pwc-tooltip">Click to edit | +/- to adjust<div class="pwc-tooltip-arrow"></div></div>
                </div>
              </div>
            </div>
          </div>
          <div class="pwc-progress-ring">
            <svg class="pwc-svg" viewBox="0 0 36 36" aria-hidden="true">
              <defs>
                <linearGradient id="pwc-ring-grad-${malId}" x1="1" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stop-color="var(--chart-blue)" />
                  <stop offset="60%"  stop-color="var(--chart-purple)" />
                  <stop offset="100%" stop-color="var(--chart-green)" />
                </linearGradient>
                <filter id="pwc-ring-glow-${malId}" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="1.2" result="blur"/>
                  <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
              </defs>
              <path class="pwc-ring-bg"   d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke-width="2.8"></path>
              <path class="pwc-ring-fill" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="url(#pwc-ring-grad-${malId})" stroke-dasharray="${percent}, 100" stroke-width="2.8" stroke-linecap="round" filter="url(#pwc-ring-glow-${malId})"></path>
            </svg>
            <span class="pwc-percentage ${pctClass}">${percent}%</span>
          </div>
        </div>
        <div class="pwc-banner">
          <div class="pwc-banner-text"><span class="material-icons pwc-banner-icon">track_changes</span><span class="pwc-banner-copy">${getBannerText(percent)}</span></div>
          <button class="pwc-finish-btn" type="button" data-watchlist-action="finish-series" data-id="${malId}" ${isCompleteReady ? "" : "disabled"}><span class="material-icons pwc-lightning">bolt</span> Finish Series</button>
        </div>
      </div>
    `;
  }


  function buildWatchlistCard(item, nextStatusMemory, selectMode = false) {
    const totalEpisodes = resolveEpisodesNumeric(item?.episodes);
    const progress = Math.max(0, Number(item?.progress || 0));
    const safeTotal = totalEpisodes > 0 ? totalEpisodes : Math.max(1, progress);
    const cappedProgress = Math.min(safeTotal, progress);
    const percent = Math.round((cappedProgress / safeTotal) * 100);
    const episodeDisplay = resolveEpisodes(item?.episodes, item?.status);
    const genreText = escapeHtml((item?.genres || []).slice(0, 3).join(", ") || "Genres unknown");
    const yearText = item?.year ? String(item.year) : "Year unknown";
    const previousStatus = watchlistStatusMemory.get(item.malId) || "";
    const rawStatus = String(item?.status || STATUS.PLAN).toLowerCase();
    const statusAnimateClass = previousStatus && String(previousStatus || "").toLowerCase() !== rawStatus ? "status-change" : "";
    nextStatusMemory.set(item.malId, rawStatus);

    const malId = Number(item?.malId || 0);
    const isPlan = rawStatus === STATUS.PLAN;
    const isWatching = rawStatus === STATUS.WATCHING || isPlan;
    const isDropped = rawStatus === STATUS_DROPPED;
    const displayStatus = isPlan ? STATUS.WATCHING : rawStatus;

    const selectedClass = selected.has(malId) ? "is-selected" : "";
    const openAttr = selectMode ? "" : `data-action="open-anime-modal"`;
    const selectOverlay = selectMode
      ? `<button class="wl-select-badge" type="button" data-watchlist-action="toggle-item-select" data-id="${malId}" aria-label="Toggle selection">${selected.has(malId) ? "✓" : ""}</button>`
      : "";

    return `<article class="wl-card-vertical watching-card-premium watchlist-item ${selectedClass} status-${escapeHtml(displayStatus)}" draggable="true" ${openAttr} data-id="${malId}"><div class="wl-card-media">${selectOverlay}<img src="${escapeHtml(item?.image || "")}" alt="${escapeHtml(normalizeTitle(item))}" class="wl-card-poster" loading="lazy"><div class="wl-overlay"></div><div class="wl-status-badge ${escapeHtml(displayStatus)} ${statusAnimateClass}">${escapeHtml(displayStatus)}</div><div class="wl-progress-overlay"><div class="wl-progress-bar"><div class="wl-progress-fill progress-glow" style="width:${percent}%"></div></div><span class="wl-progress-text-overlay">${progress} / ${episodeDisplay}</span></div></div><div class="wl-card-content"><h3 class="wl-card-title">${escapeHtml(normalizeTitle(item))}</h3><p class="wl-card-meta">${genreText} | ${yearText}</p><div class="wl-quickbar" aria-label="Quick actions" data-quickbar="1"><div class="wl-quick-right"><button class="status-pill ${isWatching ? "active" : ""}" type="button" data-watchlist-action="set-status" data-id="${malId}" data-status="${STATUS.WATCHING}">Watch</button><button class="status-pill ${isDropped ? "active" : ""}" type="button" data-watchlist-action="set-status" data-id="${malId}" data-status="${STATUS_DROPPED}">Drop</button><button class="status-pill" type="button" data-watchlist-action="set-status" data-id="${malId}" data-status="${STATUS.COMPLETED}">Completed</button></div></div></div></article>`;
  }

  function renderHighlights() {
    if (!continueStrip || !recentStrip) return;

    const all = libraryStore.getAll();
    const watching = all
      .filter((item) => item?.malId && String(item.status || "").toLowerCase() === STATUS.WATCHING)
      .sort((a, b) => Number(b?.watchProgressAt || b?.updatedAt || 0) - Number(a?.watchProgressAt || a?.updatedAt || 0));

    const recent = sortRecent(all)
      .filter((item) => item?.malId)
      .slice(0, 4);

    if (continueCount) continueCount.textContent = String(watching.length || 0);

    const stripCard = (item, kind) => {
      const malId = Number(item?.malId || 0);
      const title = escapeHtml(normalizeTitle(item));
      const img = escapeHtml(item?.image || "");
      const eps = resolveEpisodesNumeric(item?.episodes);
      const progress = Math.max(0, Number(item?.progress || 0));
      const total = eps > 0 ? eps : 0;
      const pct = total > 0 ? Math.min(100, Math.round((progress / total) * 100)) : 0;
      const subtitle = kind === "continue"
        ? (total > 0 ? `${progress}/${total} â€¢ ${pct}%` : `Ep ${progress}`)
        : `${escapeHtml(String(item?.status || ""))}`;

      const actionAttr = uiState.selectMode ? "" : `data-action="open-anime-modal"`;
      return `<div class="wl-strip-card" role="listitem" ${actionAttr} data-id="${malId}">
          <div class="wl-strip-poster">
            <img src="${img}" alt="${title}" loading="lazy">
            ${kind === "continue" && total > 0 ? `<div class="wl-strip-progress"><div class="wl-strip-progress-fill" style="width:${pct}%"></div></div>` : ""}
          </div>
          <div class="wl-strip-meta">
            <div class="wl-strip-title" title="${title}">${title}</div>
            <div class="wl-strip-sub">${subtitle}</div>
          </div>
        </div>`;
    };

    // Continue Watching: show one at a time + arrows if multiple.
    if (!watching.length) {
      continueStrip.innerHTML = `<div class="wl-strip-empty">Start tracking a show to build your queue.</div>`;
      continueNav?.classList.remove("is-visible");
    } else {
      if (continueIndex < 0) continueIndex = 0;
      continueIndex = continueIndex % watching.length;
      continueStrip.innerHTML = stripCard(watching[continueIndex], "continue");
      if (watching.length > 1) continueNav?.classList.add("is-visible");
      else continueNav?.classList.remove("is-visible");
      if (continuePrev) continuePrev.disabled = watching.length <= 1;
      if (continueNext) continueNext.disabled = watching.length <= 1;
    }

    recentStrip.innerHTML = recent.length
      ? recent.map((i) => stripCard(i, "recent")).join("")
      : `<div class="wl-strip-empty">Your recent changes will show up here.</div>`;
  }

  function render() {
    const host = watchlistBoard.parentElement;
    if (!host) return;
    const existingToolbar = host.querySelector("[data-watchlist-toolbar='1']");
    const toolbarSig = `${uiState.typeFilter}|${uiState.statusFilter}|${uiState.sortMode}|${uiState.sortAsc}`;
    if (!existingToolbar || existingToolbar.getAttribute("data-sig") !== toolbarSig) {
      if (existingToolbar) existingToolbar.remove();
      watchlistBoard.insertAdjacentHTML("beforebegin", buildToolbar());
      const inserted = host.querySelector("[data-watchlist-toolbar='1']");
      if (inserted) inserted.setAttribute("data-sig", toolbarSig);
    }

    const rows = getRows();

    // Watch history-lite (Phase 1): Continue Watching + Recently Updated strips.
    // Rendered outside the main grid so they remain stable while filtering/sorting.
        try { renderHighlights(); } catch { }

    if (!rows.length) {
      if (chunkFrameId) {
        cancelAnimationFrame(chunkFrameId);
        chunkFrameId = 0;
      }
      renderSeq += 1;
      const emptyText = uiState.statusFilter === STATUS_FILTERS.ALL
        ? "No titles in your watchlist yet."
        : `No ${uiState.statusFilter} titles right now.`;
      watchlistBoard.innerHTML = `<div class="empty-column">${escapeHtml(emptyText)}</div>`;
      renderPremiumWatchingCard();
      return;
    }

    if (chunkFrameId) {
      cancelAnimationFrame(chunkFrameId);
      chunkFrameId = 0;
    }
    renderSeq += 1;
    const currentRender = renderSeq;
    const nextStatusMemory = new Map();
    if (rows.length <= WATCHLIST_LARGE_LIST_THRESHOLD) {
      watchlistBoard.innerHTML = `${uiState.selectMode ? `<div class="wl-bulkbar" data-watchlist-bulkbar="1"><div class="wl-bulk-left"><span class="wl-bulk-count">${selected.size} selected</span></div><div class="wl-bulk-right"><button class="wl-bulk-btn" type="button" data-watchlist-action="bulk-status" data-status="${STATUS.WATCHING}">Watching</button><button class="wl-bulk-btn" type="button" data-watchlist-action="bulk-status" data-status="${STATUS_DROPPED}">Dropped</button><button class="wl-bulk-btn" type="button" data-watchlist-action="bulk-status" data-status="${STATUS.COMPLETED}">Complete</button><button class="wl-bulk-btn danger" type="button" data-watchlist-action="bulk-remove">Remove</button></div></div>` : ""}<div class="watchlist-grid">${rows.map((item) => buildWatchlistCard(item, nextStatusMemory, uiState.selectMode)).join("")}</div>`;
      watchlistStatusMemory = nextStatusMemory;
      applyCardAnimations();
      renderPremiumWatchingCard();
      return;
    }

    watchlistBoard.innerHTML = `${uiState.selectMode ? `<div class="wl-bulkbar" data-watchlist-bulkbar="1"><div class="wl-bulk-left"><span class="wl-bulk-count">${selected.size} selected</span></div><div class="wl-bulk-right"><button class="wl-bulk-btn" type="button" data-watchlist-action="bulk-status" data-status="${STATUS.WATCHING}">Watching</button><button class="wl-bulk-btn" type="button" data-watchlist-action="bulk-status" data-status="${STATUS_DROPPED}">Dropped</button><button class="wl-bulk-btn" type="button" data-watchlist-action="bulk-status" data-status="${STATUS.COMPLETED}">Complete</button><button class="wl-bulk-btn danger" type="button" data-watchlist-action="bulk-remove">Remove</button></div></div>` : ""}<div class="watchlist-grid" data-watchlist-grid="1"></div>`;
    const grid = watchlistBoard.querySelector("[data-watchlist-grid='1']");
    if (!grid) return;
    let cursor = 0;
    function pump() {
      if (currentRender !== renderSeq) return;
      const slice = rows.slice(cursor, cursor + WATCHLIST_RENDER_CHUNK_SIZE);
      if (slice.length) grid.insertAdjacentHTML("beforeend", slice.map((item) => buildWatchlistCard(item, nextStatusMemory, uiState.selectMode)).join(""));
      cursor += slice.length;
      if (cursor < rows.length) {
        chunkFrameId = requestAnimationFrame(pump);
        return;
      }
      chunkFrameId = 0;
      watchlistStatusMemory = nextStatusMemory;
      applyCardAnimations();
    }
    renderPremiumWatchingCard();
    pump();
  }

  async function handleActionClick(event) {
    const actionBtn = event.target.closest("[data-watchlist-action]");
    if (!actionBtn) {
      if (uiState.selectMode) {
        const card = event.target.closest(".watchlist-item");
        if (!card) return;
        const malId = Number(card.getAttribute("data-id") || 0);
        if (!malId) return;
        event.preventDefault();
        event.stopPropagation();
        if (selected.has(malId)) selected.delete(malId);
        else selected.add(malId);
        render();
      }
      return;
    }

    // Prevent the global modal click handler from treating the parent card as clickable.
    event.preventDefault();
    event.stopPropagation();

    const action = String(actionBtn.getAttribute("data-watchlist-action") || "");
    if (action === "continue-prev" || action === "continue-next") {
      const watching = libraryStore
        .getAll()
        .filter((item) => item?.malId && String(item.status || "").toLowerCase() === STATUS.WATCHING)
        .sort((a, b) => Number(b?.watchProgressAt || b?.updatedAt || 0) - Number(a?.watchProgressAt || a?.updatedAt || 0));
      const len = watching.length;
      if (len <= 1) return;
      continueIndex = action === "continue-prev"
        ? (continueIndex - 1 + len) % len
        : (continueIndex + 1) % len;
      renderHighlights();
      return;
    }
    if (action === "set-type") {
      const type = String(actionBtn.getAttribute("data-type") || TYPE_FILTERS.ALL);
      if ([TYPE_FILTERS.ALL, TYPE_FILTERS.MOVIES, TYPE_FILTERS.SERIES].includes(type)) {
        uiState.typeFilter = type;
        render();
      }
      return;
    }
    if (action === "set-sort") {
      const sort = String(actionBtn.getAttribute("data-sort") || "az").toLowerCase();
      if (sort === "recent") {
        uiState.sortMode = "recent";
        render();
        return;
      }
      if (sort === "az") {
        if (uiState.sortMode === "az") uiState.sortAsc = !uiState.sortAsc;
        uiState.sortMode = "az";
        render();
        return;
      }
      return;
    }
    if (action === "toggle-az") {
      uiState.sortMode = "az";
      uiState.sortAsc = !uiState.sortAsc;
      render();
      return;
    }
    if (action === "set-status-filter") {
      const nextFilter = String(actionBtn.getAttribute("data-status-filter") || STATUS_FILTERS.ALL).toLowerCase();
      if ([STATUS_FILTERS.ALL, STATUS_FILTERS.WATCHING, STATUS_FILTERS.DROPPED].includes(nextFilter)) {
        uiState.statusFilter = nextFilter;
        render();
      }
      return;
    }
    if (action === "random-pick") {
      const rows = getRows();
      if (!rows.length) return;
      const randomAnime = rows[Math.floor(Math.random() * rows.length)];
      const targetCard = watchlistBoard.querySelector(`[data-id="${Number(randomAnime?.malId || 0)}"]`);
      targetCard?.classList.add("random-pick-glow");
      setTimeout(() => targetCard?.classList.remove("random-pick-glow"), 1500);
      targetCard?.scrollIntoView({ behavior: "smooth", block: "center" });
      toast?.show?.(`You should watch: ${normalizeTitle(randomAnime)}`);
      return;
    }
    const malId = Number(actionBtn.getAttribute("data-id") || 0);
    if (!malId) return;
    if (action === "progress-inc") {
      const before = getLibraryItemSnapshot(libraryStore, malId);
      libraryStore.updateProgress(malId, 1);
      const after = getLibraryItemSnapshot(libraryStore, malId);
      if (before && after) {
        showUndo({
          message: `Progress updated • ${normalizeTitle(after)}`,
          onUndo: () => {
            // Restore status first, then progress.
            libraryStore.setStatus(malId, before.status);
            const current = getLibraryItemSnapshot(libraryStore, malId);
            if (current) libraryStore.updateProgress(malId, Number(before.progress) - Number(current.progress));
          }
        });
      }
      return;
    }
    if (action === "progress-dec") {
      const before = getLibraryItemSnapshot(libraryStore, malId);
      libraryStore.updateProgress(malId, -1);
      const after = getLibraryItemSnapshot(libraryStore, malId);
      if (before && after) {
        showUndo({
          message: `Progress updated • ${normalizeTitle(after)}`,
          onUndo: () => {
            libraryStore.setStatus(malId, before.status);
            const current = getLibraryItemSnapshot(libraryStore, malId);
            if (current) libraryStore.updateProgress(malId, Number(before.progress) - Number(current.progress));
          }
        });
      }
      return;
    }
    if (action === "set-status") {
      const next = String(actionBtn.getAttribute("data-status") || "").toLowerCase();
      if (![STATUS.PLAN, STATUS.WATCHING, STATUS_DROPPED, STATUS.COMPLETED].includes(next)) return;
      const before = getLibraryItemSnapshot(libraryStore, malId);
      libraryStore.setStatus(malId, next);
      if (next === STATUS.COMPLETED) toast?.show?.("Marked as completed");
      else toast?.show?.(`Moved to ${next}`);
      const after = getLibraryItemSnapshot(libraryStore, malId);
      if (before && after) {
        showUndo({
          message: `Moved to ${next} • ${normalizeTitle(after)}`,
          onUndo: () => {
            libraryStore.setStatus(malId, before.status);
            const current = getLibraryItemSnapshot(libraryStore, malId);
            if (current) libraryStore.updateProgress(malId, Number(before.progress) - Number(current.progress));
          }
        });
      }
      return;
    }
    if (action === "finish-series") {
      const before = getLibraryItemSnapshot(libraryStore, malId);
      libraryStore.setStatus(malId, STATUS.COMPLETED);
      toast?.show?.("Marked as completed");
      if (before) {
        showUndo({
          message: `Marked completed • ${normalizeTitle(before)}`,
          onUndo: () => {
            libraryStore.setStatus(malId, before.status);
            const current = getLibraryItemSnapshot(libraryStore, malId);
            if (current) libraryStore.updateProgress(malId, Number(before.progress) - Number(current.progress));
          }
        });
      }
    }
  }

  function onDragStart(event) {
    const item = event.target.closest(".watchlist-item[draggable='true']");
    if (!item) return;
    event.dataTransfer?.setData("text/plain", item.getAttribute("data-id") || "");
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    item.classList.add("is-dragging");
  }

  function onDragEnd(event) {
    const item = event.target.closest(".watchlist-item[draggable='true']");
    if (!item) return;
    item.classList.remove("is-dragging");
    sectionRoot.querySelectorAll(".watchlist-chip.is-drop-target").forEach((chip) => chip.classList.remove("is-drop-target"));
  }

  function onDragOver(event) {
    const target = event.target.closest(".watchlist-chip[data-drop-status]");
    if (!target) return;
    event.preventDefault();
    target.classList.add("is-drop-target");
  }

  function onDragLeave(event) {
    const target = event.target.closest(".watchlist-chip[data-drop-status]");
    if (!target) return;
    target.classList.remove("is-drop-target");
  }

  function onDrop(event) {
    const target = event.target.closest(".watchlist-chip[data-drop-status]");
    if (!target) return;
    event.preventDefault();
    target.classList.remove("is-drop-target");
    const malId = Number(event.dataTransfer?.getData("text/plain") || 0);
    const nextStatus = String(target.getAttribute("data-drop-status") || "").toLowerCase();
    if (!malId || ![STATUS.WATCHING, STATUS.PLAN, STATUS_DROPPED].includes(nextStatus)) return;
    libraryStore.setStatus(malId, nextStatus);
    toast?.show?.(`Moved to ${nextStatus}`);
  }

  sectionRoot.addEventListener("click", handleActionClick);
  premiumWatchingContainer?.addEventListener("click", handleActionClick);
  sectionRoot.addEventListener("dragstart", onDragStart);
  sectionRoot.addEventListener("dragend", onDragEnd);
  sectionRoot.addEventListener("dragover", onDragOver);
  sectionRoot.addEventListener("dragleave", onDragLeave);
  sectionRoot.addEventListener("drop", onDrop);
  const unsubscribe = libraryStore.subscribe(render);
  render();

  return Object.freeze({
    render,
    destroy() {
      renderSeq += 1;
      if (chunkFrameId) cancelAnimationFrame(chunkFrameId);
      unsubscribe();
      sectionRoot.removeEventListener("click", handleActionClick);
      premiumWatchingContainer?.removeEventListener("click", handleActionClick);
      sectionRoot.removeEventListener("dragstart", onDragStart);
      sectionRoot.removeEventListener("dragend", onDragEnd);
      sectionRoot.removeEventListener("dragover", onDragOver);
      sectionRoot.removeEventListener("dragleave", onDragLeave);
      sectionRoot.removeEventListener("drop", onDrop);
    }
  });
}

function initCompletedBoard({ libraryStore, toast = null }) {
  const completedList = document.getElementById("completed-list");
  if (!completedList) return { render() { }, destroy() { } };
  const sectionRoot = completedList.parentElement || completedList;
  const uiState = { typeFilter: TYPE_FILTERS.ALL, sortAsc: true, sortMode: "az" };
  const selected = new Set();
  let selectMode = false;
  let renderSeq = 0;
  let chunkFrameId = 0;

  function getRows() {
    const rows = libraryStore.getAll().filter((item) => item.status === STATUS.COMPLETED);
    const filtered = filterByType(rows, uiState.typeFilter);
    if (uiState.sortMode === "recent") return sortRecent(filtered);
    return sortAZ(filtered, uiState.sortAsc);
  }

  function buildToolbar() {
    const isAsc = Boolean(uiState.sortAsc);
    const sortMode = uiState.sortMode === "recent" ? "recent" : "az";
    return `<div class="completed-command-bar watchlist-command-bar" data-completed-toolbar="1"><div class="watchlist-controls-group"><button class="wl-filter ${uiState.typeFilter === TYPE_FILTERS.ALL ? "active" : ""}" data-completed-action="set-type" data-type="${TYPE_FILTERS.ALL}">All</button><button class="wl-filter ${uiState.typeFilter === TYPE_FILTERS.MOVIES ? "active" : ""}" data-completed-action="set-type" data-type="${TYPE_FILTERS.MOVIES}">Movies</button><button class="wl-filter ${uiState.typeFilter === TYPE_FILTERS.SERIES ? "active" : ""}" data-completed-action="set-type" data-type="${TYPE_FILTERS.SERIES}">Series</button></div><div class="watchlist-controls-group"><button class="wl-control-btn ${sortMode === "az" ? "active" : ""}" data-completed-action="set-sort" data-sort="az">A-Z ${isAsc ? "↑" : "↓"}</button><button class="wl-control-btn ${sortMode === "recent" ? "active" : ""}" data-completed-action="set-sort" data-sort="recent">Recent</button><button class="wl-control-btn ${selectMode ? "active" : ""}" data-completed-action="toggle-select">${selectMode ? `Selected: ${selected.size}` : "Select"}</button>${selectMode ? `<button class="wl-control-btn" data-completed-action="clear-selection">Clear</button>` : ""}</div></div>`;
  }

  function buildCompletedCard(item) {
    const currentRating = Number(item?.userRating || 0);
    const starCount = Math.max(0, Math.min(5, Math.round(currentRating / 2)));
    const overlayStars = `${"★".repeat(starCount)}${"☆".repeat(5 - starCount)}`;
    const malId = Number(item?.malId || 0);
    const selectedClass = selected.has(malId) ? "is-selected" : "";
    const openAttr = selectMode ? "" : `data-action="open-anime-modal"`;
    const selectOverlay = selectMode
      ? `<button class="wl-select-badge" type="button" data-completed-action="toggle-item" data-id="${malId}" aria-label="Toggle selection">${selected.has(malId) ? "✓" : ""}</button>`
      : "";

    return `
      <div class="trophy-card-wrapper premium-card-wrapper ${selectedClass}">
        <div class="premium-cover-card" data-id="${malId}">
          <div class="cover-img-wrap" ${openAttr} data-id="${malId}">
            ${selectOverlay}
            <img class="cover-img" src="${escapeHtml(item?.image || "")}" alt="${escapeHtml(normalizeTitle(item))}">
            <span class="cover-badge">★ ${currentRating > 0 ? currentRating.toFixed(1) : '--'}</span>
            <div class="cover-gradient"></div>
            <div class="trophy-stamp">COMPLETED</div>
            ${currentRating > 0 ? `<div class="rating-overlay">${overlayStars}</div>` : ""}
          </div>
          <div class="cover-info" ${openAttr} data-id="${malId}">
            <h4 class="cover-title" title="${escapeHtml(normalizeTitle(item))}">${escapeHtml(normalizeTitle(item))}</h4>
            <p class="cover-genres">${escapeHtml((item?.genres || []).slice(0, 3).join(", ") || "Completed")}</p>
          </div>
          <div class="cover-actions ${selectMode ? "hidden" : ""}">
            <button class="status-pill" data-completed-action="move-watching" data-id="${malId}">Rewatch</button>
            <button class="status-pill" data-completed-action="move-plan" data-id="${malId}">To Watchlist</button>
          </div>
        </div>
      </div>
    `;
  }

  function render() {
    const host = completedList.parentElement;
    if (!host) return;
    const toolbarSig = `${uiState.typeFilter}|${uiState.sortMode}|${uiState.sortAsc}`;
    const existingToolbar = host.querySelector("[data-completed-toolbar='1']");
    if (!existingToolbar || existingToolbar.getAttribute("data-sig") !== toolbarSig) {
      if (existingToolbar) existingToolbar.remove();
      completedList.insertAdjacentHTML("beforebegin", buildToolbar());
      const inserted = host.querySelector("[data-completed-toolbar='1']");
      if (inserted) inserted.setAttribute("data-sig", toolbarSig);
    }
    completedList.className = "trophy-grid";
    const rows = getRows();
    if (chunkFrameId) {
      cancelAnimationFrame(chunkFrameId);
      chunkFrameId = 0;
    }
    renderSeq += 1;
    const currentRender = renderSeq;
    if (!rows.length) {
      completedList.innerHTML = '<div class="empty-state card"><p class="anime-card-meta">No completed anime yet.</p></div>';
      return;
    }

    const bulkbar = selectMode
      ? `<div class="wl-bulkbar" data-completed-bulkbar="1"><div class="wl-bulk-left"><span class="wl-bulk-count">${selected.size} selected</span></div><div class="wl-bulk-right"><button class="wl-bulk-btn" type="button" data-completed-action="bulk-status" data-status="${STATUS.WATCHING}">Rewatch</button><button class="wl-bulk-btn" type="button" data-completed-action="bulk-status" data-status="${STATUS.PLAN}">To Watchlist</button><button class="wl-bulk-btn danger" type="button" data-completed-action="bulk-remove">Remove</button></div></div>`
      : "";

    if (rows.length <= COMPLETED_LARGE_LIST_THRESHOLD) {
      completedList.innerHTML = `${bulkbar}${rows.map((item) => buildCompletedCard(item)).join("")}`;
      return;
    }
    completedList.innerHTML = bulkbar;
    let cursor = 0;
    function pump() {
      if (currentRender !== renderSeq) return;
      const slice = rows.slice(cursor, cursor + COMPLETED_RENDER_CHUNK_SIZE);
      if (slice.length) completedList.insertAdjacentHTML("beforeend", slice.map((item) => buildCompletedCard(item)).join(""));
      cursor += slice.length;
      if (cursor < rows.length) {
        chunkFrameId = requestAnimationFrame(pump);
        return;
      }
      chunkFrameId = 0;
    }
    pump();
  }

  function handleClick(event) {
    const button = event.target.closest("[data-completed-action]");
    if (!button) {
      if (selectMode) {
        const card = event.target.closest(".premium-cover-card");
        if (!card) return;
        const malId = Number(card.getAttribute("data-id") || 0);
        if (!malId) return;
        event.preventDefault();
        event.stopPropagation();
        if (selected.has(malId)) selected.delete(malId);
        else selected.add(malId);
        render();
      }
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const action = String(button.getAttribute("data-completed-action") || "");
    if (action === "set-type") {
      const type = String(button.getAttribute("data-type") || TYPE_FILTERS.ALL);
      if ([TYPE_FILTERS.ALL, TYPE_FILTERS.MOVIES, TYPE_FILTERS.SERIES].includes(type)) {
        uiState.typeFilter = type;
        render();
      }
      return;
    }
    if (action === "set-sort") {
      const sort = String(button.getAttribute("data-sort") || "az").toLowerCase();
      if (sort === "recent") {
        uiState.sortMode = "recent";
        render();
        return;
      }
      if (sort === "az") {
        if (uiState.sortMode === "az") uiState.sortAsc = !uiState.sortAsc;
        uiState.sortMode = "az";
        render();
        return;
      }
      return;
    }
    if (action === "toggle-az") {
      uiState.sortMode = "az";
      uiState.sortAsc = !uiState.sortAsc;
      render();
      return;
    }
    if (action === "toggle-select") {
      selectMode = !selectMode;
      if (!selectMode) selected.clear();
      render();
      return;
    }
    if (action === "clear-selection") {
      selected.clear();
      render();
      return;
    }
    if (action === "toggle-item") {
      const malId = Number(button.getAttribute("data-id") || 0);
      if (!malId) return;
      if (selected.has(malId)) selected.delete(malId);
      else selected.add(malId);
      render();
      return;
    }
    if (action === "bulk-status") {
      if (!selected.size) return;
      const next = String(button.getAttribute("data-status") || "").toLowerCase();
      if (![STATUS.WATCHING, STATUS_DROPPED, STATUS.COMPLETED].includes(next)) return;
      const ids = Array.from(selected.values());
      if (typeof libraryStore.setStatusMany === "function") libraryStore.setStatusMany(ids, next);
      else ids.forEach((id) => libraryStore.setStatus(id, next));
      toast?.show?.(`Updated ${ids.length} titles`);
      selected.clear();
      selectMode = false;
      render();
      return;
    }
    if (action === "bulk-remove") {
      if (!selected.size) return;
      const ids = Array.from(selected.values());
      const confirmed = window.confirm(`Remove ${ids.length} selected title(s) from your library?`);
      if (!confirmed) return;
      if (typeof libraryStore.removeMany === "function") libraryStore.removeMany(ids);
      else ids.forEach((id) => libraryStore.remove(id));
      toast?.show?.(`Removed ${ids.length} title(s)`);
      selected.clear();
      selectMode = false;
      render();
      return;
    }
    if (action === "move-watching") {
      const malId = Number(button.getAttribute("data-id") || 0);
      if (!malId) return;
      const before = getLibraryItemSnapshot(libraryStore, malId);
      libraryStore.setStatus(malId, STATUS.WATCHING);
      libraryStore.updateProgress(malId, -9999);
      toast?.show?.("Moved to watching for rewatch");
      if (before) {
        showUndo({
          message: `Moved to watching • ${normalizeTitle(before)}`,
          onUndo: () => {
            libraryStore.setStatus(malId, before.status);
            const current = getLibraryItemSnapshot(libraryStore, malId);
            if (current) libraryStore.updateProgress(malId, Number(before.progress) - Number(current.progress));
          }
        });
      }
      return;
    }
    if (action === "move-plan") {
      const malId = Number(button.getAttribute("data-id") || 0);
      if (!malId) return;
      const before = getLibraryItemSnapshot(libraryStore, malId);
      libraryStore.setStatus(malId, STATUS.PLAN);
      toast?.show?.("Moved to watchlist");
      if (before) {
        showUndo({
          message: `Moved to watchlist • ${normalizeTitle(before)}`,
          onUndo: () => {
            libraryStore.setStatus(malId, before.status);
            const current = getLibraryItemSnapshot(libraryStore, malId);
            if (current) libraryStore.updateProgress(malId, Number(before.progress) - Number(current.progress));
          }
        });
      }
    }
  }

  sectionRoot.addEventListener("click", handleClick);
  const unsubscribe = libraryStore.subscribe(render);
  render();
  return Object.freeze({
    render,
    destroy() {
      renderSeq += 1;
      if (chunkFrameId) cancelAnimationFrame(chunkFrameId);
      unsubscribe();
      sectionRoot.removeEventListener("click", handleClick);
    }
  });
}

function normalizeTitleText(title) {
  if (typeof title !== "string") return "";
  let cleaned = title.replace(/\s+/g, " ").trim();
  cleaned = cleaned.replace(/\s*[-:]\s*Part\s+\d+\s*$/i, "");
  cleaned = cleaned.replace(/\s+Part\s+\d+\s*$/i, "");
  cleaned = cleaned.replace(/\s*[-:]\s*$/g, "").trim();
  return cleaned;
}

function getDisplayTitle(anime) {
  const titles = Array.isArray(anime?.titles) ? anime.titles : [];
  const englishFromTitles = titles.find((entry) => String(entry?.type || "").toLowerCase() === "english")?.title || "";
  const candidates = [anime?.title_english, englishFromTitles, anime?.title];
  for (const candidate of candidates) {
    const normalized = normalizeTitleText(candidate);
    if (normalized) return normalized;
  }
  return "Unknown Title";
}

function toDetail(raw, fallback = {}, existing = null) {
  const data = raw?.data || {};
  const genres = Array.isArray(data?.genres)
    ? data.genres.map((genre) => genre?.name).filter(Boolean)
    : (Array.isArray(fallback?.genres) ? fallback.genres : []);
  const titles = Array.isArray(data?.titles) ? data.titles : (Array.isArray(fallback?.titles) ? fallback.titles : []);
  const parsedScore = Number(data?.score ?? fallback?.score ?? existing?.score ?? 0);
  const score = Number.isFinite(parsedScore) ? parsedScore : 0;
  const parsedUserRating = Number(fallback?.userRating ?? existing?.userRating ?? 0);
  const userRating = Number.isFinite(parsedUserRating) && parsedUserRating > 0 ? parsedUserRating : null;
  return {
    malId: Number(data?.mal_id || fallback?.malId || existing?.malId || 0),
    title: String(data?.title || fallback?.title || existing?.title || ""),
    title_english: String(data?.title_english || fallback?.title_english || existing?.title_english || ""),
    titles,
    image: String(data?.images?.jpg?.large_image_url || data?.images?.jpg?.image_url || fallback?.image || existing?.image || ""),
    synopsis: String(data?.synopsis || fallback?.synopsis || existing?.synopsis || "No description available"),
    type: String(data?.type || fallback?.type || existing?.type || "Unknown"),
    duration: String(data?.duration || fallback?.duration || existing?.duration || "Unknown"),
    genres,
    year: Number(data?.year || data?.aired?.prop?.from?.year || fallback?.year || existing?.year || 0) || 0,
    episodes: resolveEpisodesNumeric(data?.episodes ?? fallback?.episodes ?? existing?.episodes),
    status: String(data?.status || fallback?.status || existing?.status || "Unknown"),
    studio: String(data?.studios?.[0]?.name || fallback?.studio || existing?.studio || "Studio unknown"),
    rating: data?.rating || fallback?.rating || (score > 0 ? score.toFixed(2) : "N/A"),
    score,
    userRating
  };
}

function initAnimeModal({ controller, libraryStore, toast = null }) {
  let root = document.getElementById("anime-detail-modal-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "anime-detail-modal-root";
    document.body.appendChild(root);
  }
  const detailCache = new Map();
  let openMalId = 0;

  function close() {
    const backdrop = root.firstElementChild;
    if (!backdrop) {
      root.innerHTML = "";
      openMalId = 0;
      document.body.classList.remove("modal-open");
      return;
    }
    backdrop.classList.remove("is-open");
    backdrop.classList.add("is-closing");
    setTimeout(() => {
      if (!root.firstElementChild) return;
      root.innerHTML = "";
      openMalId = 0;
      document.body.classList.remove("modal-open");
    }, 240);
  }

  function renderLoading() {
    root.innerHTML = `<div class="anime-modal-backdrop" data-action="close-anime-modal"><div class="anime-modal-panel anime-modal-loading" role="dialog" aria-modal="true" aria-label="Anime details"><button class="anime-modal-close" data-action="close-anime-modal" aria-label="Close"><span class="material-icons">close</span></button><div class="anime-modal-body"><div class="anime-modal-skeleton anime-modal-poster-skeleton"></div><div class="anime-modal-right"><div class="anime-modal-skeleton anime-modal-title-skeleton"></div><div class="anime-modal-skeleton anime-modal-line-skeleton"></div><div class="anime-modal-skeleton anime-modal-line-skeleton"></div><div class="anime-modal-skeleton anime-modal-line-skeleton short"></div><div class="anime-modal-info-grid">${Array.from({ length: 8 }).map(() => '<div class="anime-modal-info-item anime-modal-skeleton"></div>').join("")}</div><div class="anime-modal-skeleton anime-modal-action-skeleton"></div></div></div></div></div>`;
    requestAnimationFrame(() => root.firstElementChild?.classList.add("is-open"));
    document.body.classList.add("modal-open");
  }

  function renderError(message, malId) {
    root.innerHTML = `<div class="anime-modal-backdrop is-open" data-action="close-anime-modal"><div class="anime-modal-panel anime-modal-error" role="dialog" aria-modal="true" aria-label="Anime details"><button class="anime-modal-close" data-action="close-anime-modal" aria-label="Close"><span class="material-icons">close</span></button><div class="anime-modal-error-state"><h3>Unable to load anime details</h3><p>${escapeHtml(message || "Please try again.")}</p><button class="anime-modal-action-btn" data-action="open-anime-modal" data-id="${Number(malId || 0)}">Retry</button></div></div></div>`;
    document.body.classList.add("modal-open");
  }

  function renderDetail(detail) {
    const displayTitle = getDisplayTitle(detail);
    const libEntry = libraryStore.getAll().find((item) => Number(item?.malId || 0) === Number(detail?.malId || 0));
    const currentStatus = libEntry?.status || "";
    const inWatchlist = Boolean(currentStatus);
    const synopsisRaw = String(detail?.synopsis || "No description available");
    const synopsis = escapeHtml(synopsisRaw);
    const genres = escapeHtml((detail?.genres || []).join(", ") || "Unknown");
    const year = detail?.year || "Year unknown";
    const episodes = resolveEpisodes(detail?.episodes, detail?.status);
    const summaryTooLong = synopsisRaw.length > 220;
    const synopsisToggle = summaryTooLong ? '<button class="anime-modal-synopsis-toggle" data-action="toggle-synopsis" type="button">... Read more</button>' : "";
    const score = Number(detail?.score || 0);
    const scoreText = Number.isFinite(score) && score > 0 ? score.toFixed(2) : "N/A";
    const actions = [];
    if (!inWatchlist) {
      actions.push(`<button class="anime-modal-action-btn primary" data-action="modal-add-plan" data-id="${detail.malId}">Add to Plan</button>`);
      actions.push(`<button class="anime-modal-action-btn" data-action="modal-mark-watching" data-id="${detail.malId}">Mark as Watching</button>`);
      actions.push(`<button class="anime-modal-action-btn" data-action="modal-mark-completed" data-id="${detail.malId}">Mark as Completed</button>`);
    } else if (currentStatus === STATUS.PLAN) {
      actions.push(`<button class="anime-modal-action-btn primary" data-action="modal-mark-watching" data-id="${detail.malId}">Mark as Watching</button>`);
      actions.push(`<button class="anime-modal-action-btn" data-action="modal-mark-completed" data-id="${detail.malId}">Mark as Completed</button>`);
      actions.push(`<button class="anime-modal-action-btn danger" data-action="modal-remove" data-id="${detail.malId}">Remove</button>`);
    } else if (currentStatus === STATUS.WATCHING) {
      actions.push(`<button class="anime-modal-action-btn primary" data-action="modal-mark-completed" data-id="${detail.malId}">Mark as Completed</button>`);
      actions.push(`<button class="anime-modal-action-btn danger" data-action="modal-remove" data-id="${detail.malId}">Remove</button>`);
    } else {
      actions.push(`<button class="anime-modal-action-btn danger" data-action="modal-remove" data-id="${detail.malId}">Remove</button>`);
    }
    root.innerHTML = `<div class="anime-modal-backdrop is-open" data-action="close-anime-modal"><div class="anime-modal-panel" role="dialog" aria-modal="true" aria-labelledby="anime-modal-title"><button class="anime-modal-close" data-action="close-anime-modal" aria-label="Close"><span class="material-icons">close</span></button><div class="anime-modal-body"><div class="anime-modal-left"><div class="anime-modal-poster-wrap"><img src="${escapeHtml(detail.image)}" alt="${escapeHtml(displayTitle)}" class="anime-modal-poster" loading="lazy"></div></div><div class="anime-modal-right"><h2 id="anime-modal-title" class="anime-modal-title">${escapeHtml(displayTitle)}</h2><div class="anime-modal-synopsis-wrap"><p id="anime-modal-synopsis" class="anime-modal-synopsis">${synopsis}${synopsisToggle}</p></div><div class="anime-modal-info-grid"><div class="anime-modal-info-item"><span class="anime-modal-info-label">Type</span><span class="anime-modal-info-value">${escapeHtml(detail.type || "Unknown")}</span></div><div class="anime-modal-info-item"><span class="anime-modal-info-label">Episodes</span><span class="anime-modal-info-value">${episodes}</span></div><div class="anime-modal-info-item"><span class="anime-modal-info-label">Duration</span><span class="anime-modal-info-value">${escapeHtml(detail.duration || "Unknown")}</span></div><div class="anime-modal-info-item"><span class="anime-modal-info-label">Status</span><span class="anime-modal-info-value">${escapeHtml(detail.status || "Unknown")}</span></div><div class="anime-modal-info-item"><span class="anime-modal-info-label">Genres</span><span class="anime-modal-info-value">${genres}</span></div><div class="anime-modal-info-item"><span class="anime-modal-info-label">Studio</span><span class="anime-modal-info-value">${escapeHtml(detail.studio || "Studio unknown")}</span></div><div class="anime-modal-info-item"><span class="anime-modal-info-label">Year</span><span class="anime-modal-info-value">${year}</span></div><div class="anime-modal-info-item"><span class="anime-modal-info-label">Rating</span><span class="anime-modal-info-value">${escapeHtml(String(detail.rating || scoreText || "N/A"))}</span></div></div><div class="anime-modal-actions">${actions.join("")}</div></div></div></div></div>`;
    document.body.classList.add("modal-open");
  }

  async function open(malId, fallbackAnime = null) {
    const id = Number(malId || 0);
    if (!id) return;
    openMalId = id;
    const cached = detailCache.get(id);
    if (cached) {
      renderDetail(cached);
      return;
    }
    renderLoading();
    try {
      const raw = await controller.getAnimeDetail(id);
      const detail = toDetail(raw, fallbackAnime || {}, detailCache.get(id));
      detailCache.set(id, detail);
      if (openMalId !== id) return;
      renderDetail(detail);
    } catch {
      if (fallbackAnime) {
        const detail = toDetail({}, fallbackAnime, detailCache.get(id));
        detailCache.set(id, detail);
        renderDetail(detail);
        toast?.show?.("Loaded fallback anime details");
      } else {
        renderError("Detail API request failed.", id);
      }
    }
  }

  async function onClick(event) {
    const actionEl = event.target.closest("[data-action]");
    if (!actionEl) return;
    const action = String(actionEl.getAttribute("data-action") || "");
    const malId = Number(actionEl.getAttribute("data-id") || 0);
    if (action === "open-anime-modal") {
      await open(malId);
      return;
    }
    if (action === "close-anime-modal") {
      if (event.target.closest(".anime-modal-panel") && !event.target.closest(".anime-modal-close")) return;
      close();
      return;
    }
    if (action === "toggle-synopsis") {
      const synopsis = document.getElementById("anime-modal-synopsis");
      if (!synopsis) return;
      const expanded = synopsis.classList.toggle("expanded");
      actionEl.textContent = expanded ? "Show less" : "... Read more";
      return;
    }
    if (!malId) return;
    const current = detailCache.get(malId) || { malId, title: `Anime #${malId}` };
    if (action === "modal-add-plan") {
      libraryStore.upsert({ ...current, status: STATUS.WATCHING }, STATUS.WATCHING);
      toast?.show?.("Added to watchlist");
      renderDetail(current);
      return;
    }
    if (action === "modal-mark-watching") {
      libraryStore.upsert({ ...current, status: STATUS.WATCHING }, STATUS.WATCHING);
      toast?.show?.("Marked as watching");
      renderDetail(current);
      return;
    }
    if (action === "modal-mark-completed") {
      libraryStore.upsert({ ...current, status: STATUS.COMPLETED }, STATUS.COMPLETED);
      toast?.show?.("Marked as completed");
      close();
      return;
    }
    if (action === "modal-remove") {
      libraryStore.remove(malId);
      toast?.show?.("Removed from library");
      renderDetail(current);
    }
  }

  function onKeydown(event) {
    if (event.key === "Escape") close();
  }

  document.addEventListener("click", onClick);
  document.addEventListener("keydown", onKeydown);
  return Object.freeze({
    render() { },
    open,
    close,
    destroy() {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKeydown);
      close();
      root.remove();
    }
  });
}

function initLibraryUI(ctx) {
  const animeModal = initAnimeModal(ctx);
  const watchlistBoard = initWatchlistBoard(ctx);
  const completedBoard = initCompletedBoard(ctx);
  return Object.freeze({
    animeModal,
    watchlistBoard,
    completedBoard,
    render() {
      animeModal?.render?.();
      watchlistBoard?.render?.();
      completedBoard?.render?.();
    },
    destroy() {
      completedBoard?.destroy?.();
      watchlistBoard?.destroy?.();
      animeModal?.destroy?.();
    }
  });
}

export { TYPE_FILTERS, initLibraryUI };


