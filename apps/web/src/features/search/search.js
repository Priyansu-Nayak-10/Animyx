import { STATUS } from "../../store.js";
import { BACKEND_URL, withAuthHeaders } from "../../config.js";

const SEARCH_PAGE_SIZE = 25;
const LARGE_RENDER_THRESHOLD = 100;
const RENDER_CHUNK_SIZE = 40;

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function debounce(fn, delayMs) {
  let timer = 0;
  return (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delayMs);
  };
}

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshteinDistance(a, b) {
  const left = normalizeSearchText(a);
  const right = normalizeSearchText(b);
  const leftLen = left.length;
  const rightLen = right.length;
  if (!leftLen) return rightLen;
  if (!rightLen) return leftLen;
  const matrix = Array.from({ length: leftLen + 1 }, () => Array(rightLen + 1).fill(0));
  for (let i = 0; i <= leftLen; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= rightLen; j += 1) matrix[0][j] = j;
  for (let i = 1; i <= leftLen; i += 1) {
    for (let j = 1; j <= rightLen; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[leftLen][rightLen];
}

function subsequenceGapScore(query, target) {
  const q = normalizeSearchText(query);
  const t = normalizeSearchText(target);
  if (!q || !t) return -1;
  let qIndex = 0;
  let gapScore = 0;
  for (let i = 0; i < t.length && qIndex < q.length; i += 1) {
    if (t[i] === q[qIndex]) {
      gapScore += i;
      qIndex += 1;
    }
  }
  return qIndex === q.length ? gapScore : -1;
}

function getAnimeTitle(item) {
  let englishTitle = item?.title_english;
  if (!englishTitle && Array.isArray(item?.titles)) {
    const englishEntry = item.titles.find((entry) => entry?.type === "English");
    if (englishEntry?.title) englishTitle = englishEntry.title;
  }
  return String(englishTitle || item?.title || "Unknown");
}

function getAnimeStudios(item) {
  return Array.isArray(item?.studios)
    ? item.studios.map((studio) => String(studio?.name || "").trim()).filter(Boolean)
    : [];
}

function getAnimeYear(item) {
  return String(item?.year || item?.aired?.prop?.from?.year || "TBA");
}

function getAnimeSynonyms(item) {
  const titles = Array.isArray(item?.titles)
    ? item.titles.map((entry) => String(entry?.title || "").trim()).filter(Boolean)
    : [];
  const synonyms = Array.isArray(item?.title_synonyms)
    ? item.title_synonyms.map((entry) => String(entry || "").trim()).filter(Boolean)
    : [];
  return Array.from(new Set([String(item?.title_japanese || "").trim(), ...titles, ...synonyms].filter(Boolean)));
}

function mapSearchRecord(item) {
  const id = Number(item?.mal_id || item?.id || 0);
  const title = getAnimeTitle(item);
  const studios = getAnimeStudios(item);
  const year = getAnimeYear(item);
  const type = String(item?.type || "TV").trim() || "TV";
  return {
    id,
    title,
    poster: String(item?.images?.jpg?.image_url || item?.poster || item?.image || ""),
    type,
    studio: studios[0] || "Unknown Studio",
    year,
    synonyms: getAnimeSynonyms(item)
  };
}

function scoreRecordAgainstQuery(record, query) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return 0;
  const candidates = [record.title, ...(Array.isArray(record.synonyms) ? record.synonyms : [])]
    .map((value) => normalizeSearchText(value))
    .filter(Boolean);
  let best = 0;

  candidates.forEach((candidate) => {
    if (candidate === normalizedQuery) {
      best = Math.max(best, 1000);
      return;
    }
    if (candidate.startsWith(normalizedQuery)) {
      best = Math.max(best, 920 - Math.max(0, candidate.length - normalizedQuery.length));
      return;
    }
    const containsIndex = candidate.indexOf(normalizedQuery);
    if (containsIndex >= 0) {
      best = Math.max(best, 820 - containsIndex * 8);
      return;
    }
    const distance = levenshteinDistance(normalizedQuery, candidate.slice(0, Math.max(candidate.length, normalizedQuery.length)));
    if (distance <= 2) {
      best = Math.max(best, 720 - distance * 70);
    }
    const subsequenceScore = subsequenceGapScore(normalizedQuery, candidate);
    if (subsequenceScore >= 0) {
      best = Math.max(best, 620 - Math.min(subsequenceScore, 180));
    }
  });

  return best;
}

function rankLiveSearchResults(items, query) {
  return items
    .map((item, index) => {
      const record = mapSearchRecord(item);
      return {
        ...record,
        score: scoreRecordAgainstQuery(record, query),
        index
      };
    })
    .filter((record) => record.id > 0 && record.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.index - right.index;
    });
}

function initSearchAdvanced({
  store,
  controller,
  libraryStore,
  selectors,
  toast = null,
  navigateToView = null
}) {
  const refs = {
    globalSearchInput: document.getElementById("global-search-input"),
    searchWrapper: document.querySelector(".search-wrapper"),
    results: document.getElementById("search-results"),
    resultCount: document.getElementById("search-result-count"),
    pagination: document.getElementById("search-pagination"),
    submit: document.getElementById("search-submit-btn"),
    reset: document.getElementById("search-reset-btn"),
    genreToggle: document.getElementById("discover-genre-toggle"),
    genreMenu: document.getElementById("discover-genre-menu"),
    genreSummary: document.getElementById("discover-genre-summary"),
    typeToggle: document.getElementById("discover-type-toggle"),
    typeMenu: document.getElementById("discover-type-menu"),
    typeSummary: document.getElementById("discover-type-summary"),
    episodeGroup: document.getElementById("discover-episode-group"),
    sortToggle: document.getElementById("discover-sort-toggle"),
    sortMenu: document.getElementById("discover-sort-menu"),
    sortSummary: document.getElementById("discover-sort-summary"),
    suggestions: document.getElementById("search-suggestions")
  };

  const DEFAULT_SORT = "most_viewed";
  const DEFAULT_FILTERS = Object.freeze({
    genres: [],
    type: "",
    episodes: "",
    sort: DEFAULT_SORT
  });

  const ui = {
    page: 1,
    pageSize: SEARCH_PAGE_SIZE,
    query: "",
    searchRequestSeq: 0,
    hasSearched: false,
    filters: { ...DEFAULT_FILTERS },
    liveSearch: {
      cache: new Map(),
      controller: null,
      requestSeq: 0,
      highlightedIndex: -1,
      visibleItems: [],
      lastQuery: ""
    }
  };
  let renderSeq = 0;
  let chunkFrameId = 0;

  const GENRE_OPTIONS = [
    { name: "Action", id: 1 }, { name: "Adventure", id: 2 }, { name: "Cars", id: 3 }, { name: "Comedy", id: 4 },
    { name: "Dementia", id: 5 }, { name: "Demons", id: 6 }, { name: "Drama", id: 8 }, { name: "Ecchi", id: 9 },
    { name: "Fantasy", id: 10 }, { name: "Game", id: 11 }, { name: "Harem", id: 35 }, { name: "Historical", id: 13 },
    { name: "Horror", id: 14 }, { name: "Isekai", id: 62 }, { name: "Josei", id: 43 }, { name: "Kids", id: 15 },
    { name: "Magic", id: 16 }, { name: "Martial Arts", id: 17 }, { name: "Mecha", id: 18 }, { name: "Military", id: 38 },
    { name: "Music", id: 19 }, { name: "Mystery", id: 7 }, { name: "Parody", id: 20 }, { name: "Police", id: 39 },
    { name: "Psychological", id: 40 }, { name: "Romance", id: 22 }, { name: "Samurai", id: 21 }, { name: "School", id: 23 },
    { name: "Sci-Fi", id: 24 }, { name: "Seinen", id: 42 }, { name: "Shoujo", id: 25 }, { name: "Shoujo Ai", id: 26 },
    { name: "Shounen", id: 27 }, { name: "Shounen Ai", id: 28 }, { name: "Slice of Life", id: 36 }, { name: "Space", id: 29 },
    { name: "Sports", id: 30 }, { name: "Super Power", id: 31 }, { name: "Supernatural", id: 37 }, { name: "Thriller", id: 41 },
    { name: "Vampire", id: 32 }
  ];

  const TYPE_OPTIONS = [
    { label: "All", value: "" },
    { label: "TV", value: "tv" },
    { label: "Movie", value: "movie" },
    { label: "OVA", value: "ova" },
    { label: "Special", value: "special" }
  ];

  const SORT_OPTIONS = [
    { label: "Ratings", value: "ratings" },
    { label: "Name A–Z", value: "name_az" },
    { label: "Most Viewed", value: "most_viewed" },
    { label: "Number of Episodes", value: "episodes" }
  ];

  function getSearchDataset() {
    const snapshot = store.getState();
    return Array.isArray(snapshot?.searchResults)
      ? snapshot.searchResults
      : [];
  }

  function getSearchMeta() {
    const snapshot = store.getState();
    const meta = snapshot?.searchMeta || {};
    return {
      currentPage: Math.max(1, Number(meta?.currentPage || 1)),
      hasNextPage: Boolean(meta?.hasNextPage),
      lastVisiblePage: Math.max(1, Number(meta?.lastVisiblePage || 1)),
      totalItems: Math.max(0, Number(meta?.totalItems || 0)),
      itemsPerPage: Math.max(1, Number(meta?.itemsPerPage || 25))
    };
  }

  function buildResultCards(items) {
    if (!items.length) {
      return `
        <div class="tracker-empty" style="grid-column: 1 / -1; margin: 4rem auto; text-align: center;">
          <span class="material-icons" style="font-size: 4rem; color: var(--text-gray-600); margin-bottom: 1rem;">search_off</span>
          <h3 style="font-size: 1.25rem; font-weight: 600; margin-bottom: 0.5rem;">No results found</h3>
          <p class="anime-card-meta">Try adjusting your filters or search query.</p>
        </div>
      `;
    }
    return items.map((item) => {
      const score = Number(item?.score || 0);
      const scoreText = Number.isFinite(score) && score > 0 ? score.toFixed(1) : "N/A";
      const malId = Number(item.id || item.malId || item.mal_id || 0);
      const title = escapeHtml(String(item.title || "Unknown"));
      const genres = escapeHtml((item.genres || []).slice(0, 3).join(", ") || "Unknown");
      const image = escapeHtml(String(item.poster || item.image || ""));
      
      const totalEp = parseInt(item.total_episodes || item.episodes) || 0;
      const releasedEp = parseInt(item.released_episodes || item.episodesReleased) || 0;
      const status = String(item.airing_status || item.status || "").toLowerCase();
      const isAiring = status.includes("airing");

      let epLabel = "";
      if (isAiring) {
        if (totalEp > 0 && releasedEp > 0) epLabel = `Ep ${releasedEp} / ${totalEp}`;
        else if (releasedEp > 0) epLabel = `Ep ${releasedEp}`;
        else if (totalEp > 0) epLabel = `${totalEp} eps`;
        else epLabel = "Ongoing";
      } else {
        epLabel = totalEp > 0 ? `${totalEp} eps` : "?";
      }

      return `
        <div class="search-result-cell premium-card-wrapper">
          <div class="premium-cover-card" data-id="${malId}">
            <div class="cover-img-wrap" data-action="open-anime-modal" data-id="${malId}">
              <img class="cover-img" src="${image}" alt="${title}">
              <span class="cover-badge">⭐ ${scoreText}</span>
              <div class="cover-gradient"></div>
            </div>
            <div class="cover-info" data-action="open-anime-modal" data-id="${malId}">
              <h4 class="cover-title" title="${title}">${title}</h4>
              <p class="cover-genres">${genres} · ${epLabel}</p>
            </div>
            <div class="cover-actions">
              <button class="status-pill status-plan" type="button" data-search-action="add-plan" data-id="${malId}">Plan</button>
              <button class="status-pill status-watching" type="button" data-search-action="add-watching" data-id="${malId}">Watch</button>
              <button class="status-pill status-completed" type="button" data-search-action="add-completed" data-id="${malId}">Done</button>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  function cancelChunkRender() {
    renderSeq += 1;
    if (!chunkFrameId) return;
    cancelAnimationFrame(chunkFrameId);
    chunkFrameId = 0;
  }

  function renderCards(items) {
    if (!refs.results) return;
    const rows = Array.isArray(items) ? items : [];
    if (!rows.length) {
      refs.results.innerHTML = buildResultCards([]);
      return;
    }
    if (rows.length <= LARGE_RENDER_THRESHOLD) {
      refs.results.innerHTML = buildResultCards(rows);
      return;
    }

    const currentRender = ++renderSeq;
    refs.results.innerHTML = "";
    let cursor = 0;
    function pump() {
      if (currentRender !== renderSeq) return;
      const slice = rows.slice(cursor, cursor + RENDER_CHUNK_SIZE);
      if (slice.length) refs.results.insertAdjacentHTML("beforeend", buildResultCards(slice));
      cursor += slice.length;
      if (cursor < rows.length) {
        chunkFrameId = requestAnimationFrame(pump);
        return;
      }
      chunkFrameId = 0;
    }
    pump();
  }

  function renderFooter(totalResults, meta) {
    if (refs.resultCount) {
      const pageInfo = `Page ${ui.page} / ${meta.lastVisiblePage}`;
      const totalItemsText = meta.totalItems > 0
        ? ` of ${meta.totalItems}`
        : "";
      refs.resultCount.textContent = totalResults
        ? `${pageInfo} - ${totalResults} results${totalItemsText}`
        : `${pageInfo} - No results`;
    }
    if (!refs.pagination) return;
    refs.pagination.innerHTML = `
      <button class="page-btn" data-search-action="page" data-page="${ui.page - 1}" ${ui.page > 1 ? "" : "disabled"}>Prev</button>
      <button class="page-btn active" type="button" aria-current="page">${ui.page}</button>
      <button class="page-btn" data-search-action="page" data-page="${ui.page + 1}" ${meta.hasNextPage ? "" : "disabled"}>Next</button>
    `;
  }

  let openDiscoverDropdown = "";

  function setDiscoverDropdownOpen(kind, isOpen) {
    const open = Boolean(isOpen);
    const mapping = {
      genre: { toggle: refs.genreToggle, menu: refs.genreMenu },
      type: { toggle: refs.typeToggle, menu: refs.typeMenu },
      sort: { toggle: refs.sortToggle, menu: refs.sortMenu }
    };
    const entry = mapping[kind];
    if (!entry?.toggle || !entry?.menu) return;

    entry.toggle.setAttribute("aria-expanded", open ? "true" : "false");
    entry.menu.classList.toggle("is-open", open);
    openDiscoverDropdown = open ? kind : "";
  }

  function closeDiscoverDropdowns() {
    ["genre", "type", "sort"].forEach((kind) => setDiscoverDropdownOpen(kind, false));
  }

  function toggleDiscoverDropdown(kind) {
    const isAlreadyOpen = openDiscoverDropdown === kind;
    closeDiscoverDropdowns();
    setDiscoverDropdownOpen(kind, !isAlreadyOpen);
  }

  const accentForGenre = (name) => {
    const key = String(name || "").trim().toLowerCase();
    const mapping = {
      action: "244, 63, 94",
      adventure: "251, 146, 60",
      cars: "245, 158, 11",
      comedy: "250, 204, 21",
      dementia: "148, 163, 184",
      demons: "251, 113, 133",
      drama: "251, 113, 133",
      ecchi: "232, 121, 249",
      fantasy: "168, 85, 247",
      game: "45, 212, 191",
      harem: "244, 114, 182",
      historical: "214, 158, 46",
      horror: "190, 18, 60",
      isekai: "99, 102, 241",
      josei: "236, 72, 153",
      kids: "34, 197, 94",
      magic: "139, 92, 246",
      "martial arts": "249, 115, 22",
      mecha: "34, 211, 238",
      military: "163, 230, 53",
      music: "34, 197, 94",
      mystery: "96, 165, 250",
      parody: "190, 242, 100",
      police: "56, 189, 248",
      psychological: "196, 181, 253",
      romance: "251, 113, 133",
      samurai: "248, 113, 113",
      school: "99, 102, 241",
      "sci-fi": "34, 211, 238",
      seinen: "148, 163, 184",
      shoujo: "244, 114, 182",
      "shoujo ai": "199, 210, 254",
      shounen: "251, 146, 60",
      "shounen ai": "252, 165, 165",
      "slice of life": "34, 197, 94",
      space: "56, 189, 248",
      sports: "34, 197, 94",
      "super power": "129, 140, 248",
      supernatural: "139, 92, 246",
      thriller: "148, 163, 184",
      vampire: "244, 63, 94"
    };
    return mapping[key] || "167, 139, 250";
  };

  function renderGenreSummary() {
    if (!refs.genreSummary) return;
    const selectedIds = Array.isArray(ui.filters.genres) ? ui.filters.genres : [];
    const selected = GENRE_OPTIONS.filter((opt) => selectedIds.includes(String(opt.id)));
    if (!selected.length) {
      refs.genreSummary.innerHTML = '<span class="discover-chip discover-chip-muted">Select genres</span>';
      return;
    }
    const MAX_VISIBLE = 4;
    const primary = selected.slice(0, MAX_VISIBLE).map((g) => {
      const rgb = accentForGenre(g.name);
      const style = rgb ? `style="background:rgba(${rgb},0.18);border-color:rgba(${rgb},0.45);color:rgba(${rgb},1);"` : "";
      return `<span class="discover-chip discover-chip-colored" ${style}>${escapeHtml(g.name)}</span>`;
    }).join("");
    const remaining = selected.length - MAX_VISIBLE;
    const tail = remaining > 0 ? `<span class="discover-chip discover-chip-muted">+${remaining}</span>` : "";
    refs.genreSummary.innerHTML = primary + tail;
  }

  function renderGenreMenu() {
    if (!refs.genreMenu) return;
    const selectedIds = new Set(Array.isArray(ui.filters.genres) ? ui.filters.genres : []);

    // accentForGenre is now a shared const defined above

    refs.genreMenu.innerHTML = `
      <div class="discover-menu-grid">
        ${GENRE_OPTIONS.map((opt) => `
          <label class="discover-check" style="--genre-accent: ${accentForGenre(opt.name)}">
            <input type="checkbox" value="${String(opt.id)}" ${selectedIds.has(String(opt.id)) ? "checked" : ""} />
            <span>${escapeHtml(opt.name)}</span>
          </label>
        `).join("")}
      </div>
    `;
  }

  function renderTypeMenu() {
    if (!refs.typeMenu) return;
    refs.typeMenu.innerHTML = TYPE_OPTIONS.map((opt) => `
      <button type="button" class="discover-menu-option${ui.filters.type === opt.value ? " is-selected" : ""}" data-type="${escapeHtml(opt.value)}">
        <span>${escapeHtml(opt.label)}</span>
      </button>
    `).join("");
  }

  function renderSortMenu() {
    if (!refs.sortMenu) return;
    refs.sortMenu.innerHTML = SORT_OPTIONS.map((opt) => `
      <button type="button" class="discover-menu-option${ui.filters.sort === opt.value ? " is-selected" : ""}" data-sort="${escapeHtml(opt.value)}">
        <span>${escapeHtml(opt.label)}</span>
      </button>
    `).join("");
  }

  function syncTypeSummary() {
    if (!refs.typeSummary) return;
    const opt = TYPE_OPTIONS.find((row) => row.value === ui.filters.type) || TYPE_OPTIONS[0];
    refs.typeSummary.textContent = opt?.label || "All";
  }

  function syncSortSummary() {
    if (!refs.sortSummary) return;
    const opt = SORT_OPTIONS.find((row) => row.value === ui.filters.sort) || SORT_OPTIONS.find((row) => row.value === DEFAULT_SORT);
    refs.sortSummary.textContent = opt?.label || "Most Viewed";
  }

  function setDropdownOpen(isOpen) {
    refs.searchWrapper?.classList.toggle("is-open", Boolean(isOpen));
    if (!refs.suggestions) return;
    refs.suggestions.style.display = isOpen ? "block" : "none";
    refs.suggestions.classList.toggle("active", Boolean(isOpen));
    refs.globalSearchInput?.setAttribute("aria-expanded", isOpen ? "true" : "false");
  }

  function clearLiveSearchState() {
    ui.liveSearch.highlightedIndex = -1;
    ui.liveSearch.visibleItems = [];
  }

  function hideSuggestions() {
    clearLiveSearchState();
    setDropdownOpen(false);
  }

  async function fetchLiveSuggestions(query) {
    if (!refs.suggestions) return;
    if (!query) {
      hideSuggestions();
      return;
    }
    try {
      const res = await fetch(`${BACKEND_URL}/anime/search?q=${encodeURIComponent(query)}&limit=5`, {
        headers: withAuthHeaders()
      });
      const payload = await res.json();
      const items = Array.isArray(payload?.data) ? payload.data : [];

      if (!items.length) {
        refs.suggestions.innerHTML = '<div style="padding: 12px; text-align: center; color: var(--text-gray-400); font-size: 0.85rem;">No results found</div>';
      } else {
        refs.suggestions.innerHTML = items.map(item => {
          const malId = item.mal_id || 0;
          let engTitle = item.title_english;
          if (!engTitle && Array.isArray(item.titles)) {
            const eng = item.titles.find(t => t.type === 'English');
            if (eng) engTitle = eng.title;
          }
          const title = escapeHtml(engTitle || item.title || "Unknown");
          const img = escapeHtml(item.images?.jpg?.image_url || "");
          const type = escapeHtml(item.type || "TV");
          const year = item.year || item.aired?.prop?.from?.year || "";
          return `
            <a href="#" class="suggestion-item" data-action="open-anime-modal" data-id="${malId}">
              <img src="${img}" class="suggestion-img" alt="${title}" loading="lazy"/>
              <div class="suggestion-details">
                <span class="suggestion-title">${title}</span>
                <span class="suggestion-meta">${type} ${year ? '• ' + year : ''}</span>
              </div>
            </a>
          `;
        }).join('') + `
          <div class="suggestion-view-all" data-search-action="view-all-results">View all results for "${escapeHtml(query)}"</div>
        `;
      }
      refs.suggestions.style.display = 'flex';
      setTimeout(() => refs.suggestions.classList.add('active'), 10);
    } catch (e) {
      console.error("Live suggestion failed", e);
    }
  }

  function renderSuggestionState(message, kind = "empty") {
    if (!refs.suggestions) return;
    clearLiveSearchState();
    refs.suggestions.innerHTML = `
      <div class="search-dropdown-shell">
        <div class="search-dropdown-state ${kind === "loading" ? "is-loading" : ""}">${escapeHtml(message)}</div>
      </div>
    `;
    setDropdownOpen(true);
  }

  function renderSuggestionGroups(records) {
    if (!refs.suggestions) return;
    const topMatches = records.filter((record) => record.score >= 760).slice(0, 3);
    const otherResults = records
      .filter((record) => !topMatches.some((match) => match.id === record.id))
      .slice(0, 5);
    const visibleItems = [...topMatches, ...otherResults].slice(0, 8);
    ui.liveSearch.visibleItems = visibleItems;
    ui.liveSearch.highlightedIndex = visibleItems.length ? 0 : -1;

    const buildSection = (label, rows, offset) => {
      if (!rows.length) return "";
      return `
        <section class="search-dropdown-section">
          <div class="search-dropdown-heading">${escapeHtml(label)}</div>
          ${rows.map((item, index) => {
            const optionIndex = offset + index;
            return `
              <button
                type="button"
                class="suggestion-item search-result-option${optionIndex === ui.liveSearch.highlightedIndex ? " is-active" : ""}"
                role="option"
                aria-selected="${optionIndex === ui.liveSearch.highlightedIndex ? "true" : "false"}"
                data-live-search-open="anime"
                data-id="${item.id}"
                data-index="${optionIndex}">
                ${item.poster
                  ? `<img src="${escapeHtml(item.poster)}" class="suggestion-img" alt="${escapeHtml(item.title)}" loading="lazy" />`
                  : '<div class="suggestion-img suggestion-img-fallback">ANIME</div>'}
                <span class="suggestion-details">
                  <span class="suggestion-title">${escapeHtml(item.title)}</span>
                  <span class="suggestion-meta">${escapeHtml(`${item.type} • ${item.studio} • ${item.year}`)}</span>
                </span>
              </button>
            `;
          }).join("")}
        </section>
      `;
    };

    refs.suggestions.innerHTML = `
      <div class="search-dropdown-shell">
        <div class="search-dropdown-label">Search Results</div>
        ${buildSection("Top Matches", topMatches, 0)}
        ${buildSection("Other Results", otherResults, topMatches.length)}
        <button type="button" class="suggestion-view-all" data-search-action="view-all-results">
          View all results <span aria-hidden="true">?</span>
        </button>
      </div>
    `;
    setDropdownOpen(true);
  }

  function abortLiveSearchRequest() {
    ui.liveSearch.controller?.abort?.();
    ui.liveSearch.controller = null;
  }

  async function fetchLiveSuggestionsManaged(query) {
    if (!refs.suggestions) return;
    const trimmedQuery = String(query || "").trim();
    if (trimmedQuery.length < 2) {
      hideSuggestions();
      return;
    }
    ui.liveSearch.lastQuery = trimmedQuery;
    const cacheKey = normalizeSearchText(trimmedQuery);
    if (ui.liveSearch.cache.has(cacheKey)) {
      renderSuggestionGroups(ui.liveSearch.cache.get(cacheKey));
      return;
    }

    abortLiveSearchRequest();
    const controllerSignal = new AbortController();
    ui.liveSearch.controller = controllerSignal;
    const reqId = ++ui.liveSearch.requestSeq;
    renderSuggestionState("Searching anime titles...", "loading");

    try {
      const res = await fetch(`${BACKEND_URL}/anime/search?q=${encodeURIComponent(trimmedQuery)}&limit=12`, {
        headers: withAuthHeaders(),
        signal: controllerSignal.signal
      });
      if (!res.ok) throw new Error(`Search failed: ${res.status}`);
      const payload = await res.json();
      if (reqId !== ui.liveSearch.requestSeq || trimmedQuery !== String(refs.globalSearchInput?.value || "").trim()) return;
      const items = Array.isArray(payload?.data) ? payload.data : [];
      const ranked = rankLiveSearchResults(items, trimmedQuery).slice(0, 8);
      ui.liveSearch.cache.set(cacheKey, ranked);
      if (!ranked.length) {
        renderSuggestionState(`No anime titles found for "${trimmedQuery}"`);
        return;
      }
      renderSuggestionGroups(ranked);
    } catch (e) {
      if (e?.name === "AbortError") return;
      console.error("Live suggestion failed", e);
      renderSuggestionState("Unable to load search results right now.");
    } finally {
      if (ui.liveSearch.controller === controllerSignal) {
        ui.liveSearch.controller = null;
      }
    }
  }

  function updateHighlightedResult(nextIndex) {
    const items = Array.isArray(ui.liveSearch.visibleItems) ? ui.liveSearch.visibleItems : [];
    if (!items.length || !refs.suggestions) return;
    const boundedIndex = ((nextIndex % items.length) + items.length) % items.length;
    ui.liveSearch.highlightedIndex = boundedIndex;
    refs.suggestions.querySelectorAll(".suggestion-item").forEach((element) => {
      const currentIndex = Number(element.getAttribute("data-index") || -1);
      const isActive = currentIndex === boundedIndex;
      element.classList.toggle("is-active", isActive);
      element.setAttribute("aria-selected", isActive ? "true" : "false");
      if (isActive) element.scrollIntoView({ block: "nearest" });
    });
  }

  function syncSearchQueryParam(query, view = "search") {
    try {
      const url = new URL(globalThis.location.href);
      if (query) {
        url.searchParams.set("q", query);
        url.searchParams.set("view", view);
      } else {
        url.searchParams.delete("q");
        url.searchParams.delete("view");
      }
      globalThis.history.replaceState({}, "", url);
    } catch {}
  }

  async function performQuery(rawQuery, page = 1) {
    const query = String(rawQuery || "").trim();
    if (typeof navigateToView === "function") navigateToView("search-view");
    ui.query = query;
    ui.page = Math.max(1, Number(page) || 1);
    ui.hasSearched = true;
    const reqId = ++ui.searchRequestSeq;

    abortLiveSearchRequest();
    hideSuggestions();
    syncSearchQueryParam(query);

    store.setLoading("search", true);
    store.setError("search", "");
    render();
    try {
      // Delegate completely to server-side filtering
      await controller.performSearch(query, ui.page, ui.filters);
      if (reqId !== ui.searchRequestSeq) return;

      if (refs.globalSearchInput) refs.globalSearchInput.value = query;
      // Keep filter selections intact so users can refine results iteratively.

    } finally {
      if (reqId !== ui.searchRequestSeq) return;
      store.setLoading("search", false);
      render();
    }
  }

  function render() {
    if (!refs.results) return;
    cancelChunkRender();
    const snapshot = store.getState();
    const meta = getSearchMeta();
    const loading = Boolean(snapshot?.loading?.search);
    const error = String(snapshot?.errors?.search || "");
    if (!loading) ui.page = meta.currentPage;

    // Discover is a precision tool: no homepage rails or auto-search.
    if (!ui.hasSearched && !loading && !error && getSearchDataset().length === 0) {
      refs.results.innerHTML = `
        <div class="empty-state card" style="grid-column: 1 / -1;">
          <p class="anime-card-meta">Start typing a title or apply filters to search.</p>
        </div>
      `;
      if (refs.resultCount) refs.resultCount.textContent = "";
      if (refs.pagination) refs.pagination.innerHTML = "";
      return;
    }

    if (loading) {
      refs.results.innerHTML = Array.from({ length: Math.min(ui.pageSize, 10) }).map(() => `
        <article class="anime-card-v2" style="pointer-events: none;">
          <div class="anime-modal-skeleton" style="width: 100%; aspect-ratio: 2/3; border-radius: 0.5rem; margin-bottom: 0.75rem;"></div>
          <div class="anime-card-content">
            <div class="anime-modal-skeleton anime-modal-line-skeleton short" style="height: 14px; margin-bottom: 8px;"></div>
            <div class="anime-modal-skeleton anime-modal-line-skeleton" style="height: 12px; width: 60%;"></div>
          </div>
        </article>
      `).join("");
      renderFooter(0, meta);
      return;
    }

    if (error) {
      refs.results.innerHTML = `<div class="empty-state card"><p class="anime-card-meta">${escapeHtml(error)}</p></div>`;
      renderFooter(0, meta);
      return;
    }

    const rows = getSearchDataset();
    renderCards(rows);
    renderFooter(rows.length, meta);
  }

  function hasActiveFilters() {
    if (Array.isArray(ui.filters.genres) && ui.filters.genres.length) return true;
    if (String(ui.filters.type || "").trim()) return true;
    if (String(ui.filters.episodes || "").trim()) return true;
    return String(ui.filters.sort || DEFAULT_SORT).trim() !== DEFAULT_SORT;
  }

  async function onClick(event) {
    const liveResultBtn = event.target.closest("[data-live-search-open='anime']");
    if (liveResultBtn) {
      event.preventDefault();
      const malId = Number(liveResultBtn.getAttribute("data-id") || 0);
      if (!malId) return;
      hideSuggestions();
      refs.globalSearchInput?.blur();
      const fallbackBtn = document.createElement("button");
      fallbackBtn.type = "button";
      fallbackBtn.hidden = true;
      fallbackBtn.setAttribute("data-action", "open-anime-modal");
      fallbackBtn.setAttribute("data-id", String(malId));
      refs.suggestions.appendChild(fallbackBtn);
      fallbackBtn.click();
      fallbackBtn.remove();
      return;
    }

    const actionBtn = event.target.closest("[data-search-action]");
    if (!actionBtn) return;
    const action = String(actionBtn.getAttribute("data-search-action") || "");

    if (action === "view-all-results") {
      event.preventDefault();
      await performQuery(refs.globalSearchInput?.value || "", 1);
      return;
    }

    if (action === "page") {
      const nextPage = Number(actionBtn.getAttribute("data-page") || 1);
      if (!Number.isFinite(nextPage) || nextPage < 1) return;
      await performQuery(ui.query, Math.trunc(nextPage));
      refs.results?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    const malId = Number(actionBtn.getAttribute("data-id") || 0);
    if (!malId) return;
    const source = getSearchDataset();
    const anime = source.find((row) => Number(row?.malId || 0) === malId);
    if (!anime) return;
    if (action === "add-plan") {
      libraryStore.upsert({ ...anime, status: STATUS.PLAN }, STATUS.PLAN);
      toast?.show?.("Added to Plan to Watch");
    } else if (action === "add-watching") {
      libraryStore.upsert({ ...anime, status: STATUS.WATCHING }, STATUS.WATCHING);
      toast?.show?.("Marked as watching");
    } else if (action === "add-completed") {
      libraryStore.upsert({ ...anime, status: STATUS.COMPLETED }, STATUS.COMPLETED);
      toast?.show?.("Marked as completed");
    }
    // Visually highlight the clicked status button and deactivate siblings
    if (["add-plan", "add-watching", "add-completed"].includes(action)) {
      const card = actionBtn.closest(".premium-cover-card");
      if (card) {
        card.querySelectorAll(".status-pill").forEach((btn) => btn.classList.remove("active"));
        actionBtn.classList.add("active");
      }
    }
  }

  const onGlobalKeydown = (event) => {
    const query = String(refs.globalSearchInput?.value || "").trim();
    if (event.key === "Escape") {
      abortLiveSearchRequest();
      hideSuggestions();
      refs.globalSearchInput?.blur();
      return;
    }
    if (event.key === "ArrowDown") {
      if (query.length < 2) return;
      event.preventDefault();
      if (!refs.suggestions?.classList.contains("active")) {
        void fetchLiveSuggestionsManaged(query);
        return;
      }
      updateHighlightedResult(ui.liveSearch.highlightedIndex + 1);
      return;
    }
    if (event.key === "ArrowUp") {
      if (!refs.suggestions?.classList.contains("active")) return;
      event.preventDefault();
      updateHighlightedResult(ui.liveSearch.highlightedIndex - 1);
      return;
    }
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (refs.suggestions?.classList.contains("active") && ui.liveSearch.highlightedIndex >= 0) {
      const selected = ui.liveSearch.visibleItems[ui.liveSearch.highlightedIndex];
      if (selected?.id) {
        const trigger = refs.suggestions.querySelector(`[data-live-search-open='anime'][data-id='${selected.id}']`);
        trigger?.click();
        return;
      }
    }
    if (query.length >= 2) {
      void performQuery(query, 1);
      refs.globalSearchInput?.blur();
    }
  };

  const debouncedSuggest = debounce(() => {
    void fetchLiveSuggestionsManaged(refs.globalSearchInput?.value || "");
  }, 300);

  const onGlobalInput = () => {
    const query = String(refs.globalSearchInput?.value || "").trim();
    if (query.length < 2) {
      abortLiveSearchRequest();
      hideSuggestions();
      return;
    }
    debouncedSuggest();
  };

  const onGlobalFocus = () => {
    const query = String(refs.globalSearchInput?.value || "").trim();
    if (query.length >= 2) {
      void fetchLiveSuggestionsManaged(query);
    }
  };

  refs.globalSearchInput?.addEventListener("input", onGlobalInput);
  refs.globalSearchInput?.addEventListener("keydown", onGlobalKeydown);
  refs.globalSearchInput?.addEventListener("focus", onGlobalFocus);

  // Close suggestions if clicked outside
  document.addEventListener("click", (e) => {
    if (refs.searchWrapper && !refs.searchWrapper.contains(e.target)) {
      abortLiveSearchRequest();
      hideSuggestions();
    }
  });

  const onDocumentClick = (e) => {
    const target = e.target;
    if (!openDiscoverDropdown) return;
    const elements = [
      refs.genreToggle, refs.genreMenu,
      refs.typeToggle, refs.typeMenu,
      refs.sortToggle, refs.sortMenu
    ].filter(Boolean);
    if (elements.some((el) => el.contains(target))) return;
    closeDiscoverDropdowns();
  };
  document.addEventListener("click", onDocumentClick);

  const onDocumentKeydown = (event) => {
    if (event.key !== "Escape") return;
    closeDiscoverDropdowns();
    abortLiveSearchRequest();
    hideSuggestions();
  };
  document.addEventListener("keydown", onDocumentKeydown);

  refs.genreToggle?.addEventListener("click", (e) => {
    e.preventDefault();
    toggleDiscoverDropdown("genre");
  });

  refs.typeToggle?.addEventListener("click", (e) => {
    e.preventDefault();
    toggleDiscoverDropdown("type");
  });

  refs.sortToggle?.addEventListener("click", (e) => {
    e.preventDefault();
    toggleDiscoverDropdown("sort");
  });

  refs.genreMenu?.addEventListener("change", (e) => {
    const checkbox = e.target?.closest?.("input[type='checkbox']");
    if (!checkbox) return;
    const id = String(checkbox.value || "").trim();
    const next = new Set(Array.isArray(ui.filters.genres) ? ui.filters.genres : []);
    if (checkbox.checked) next.add(id);
    else next.delete(id);
    ui.filters.genres = Array.from(next);
    renderGenreSummary();
  });

  refs.typeMenu?.addEventListener("click", (e) => {
    const btn = e.target?.closest?.("button[data-type]");
    if (!btn) return;
    ui.filters.type = String(btn.getAttribute("data-type") || "");
    syncTypeSummary();
    renderTypeMenu();
    closeDiscoverDropdowns();
  });

  refs.sortMenu?.addEventListener("click", (e) => {
    const btn = e.target?.closest?.("button[data-sort]");
    if (!btn) return;
    ui.filters.sort = String(btn.getAttribute("data-sort") || DEFAULT_SORT) || DEFAULT_SORT;
    syncSortSummary();
    renderSortMenu();
    closeDiscoverDropdowns();
  });

  refs.episodeGroup?.addEventListener("click", (e) => {
    const btn = e.target?.closest?.("button[data-episode]");
    if (!btn) return;
    const value = String(btn.getAttribute("data-episode") || "").trim();
    const next = ui.filters.episodes === value ? "" : value;
    ui.filters.episodes = next;
    refs.episodeGroup.querySelectorAll("button[data-episode]").forEach((node) => {
      node.classList.toggle("is-active", String(node.getAttribute("data-episode") || "") === next);
    });
  });

  refs.submit?.addEventListener("click", () => {
    void performQuery(refs.globalSearchInput?.value || "", 1);
  });

  refs.reset?.addEventListener("click", () => {
    if (refs.globalSearchInput) refs.globalSearchInput.value = "";
    ui.filters = { ...DEFAULT_FILTERS, genres: [] };
    ui.hasSearched = false;
    closeDiscoverDropdowns();
    if (refs.episodeGroup) {
      refs.episodeGroup.querySelectorAll("button[data-episode]").forEach((node) => node.classList.remove("is-active"));
    }
    renderGenreMenu();
    renderGenreSummary();
    syncTypeSummary();
    renderTypeMenu();
    syncSortSummary();
    renderSortMenu();
    ui.query = "";
    ui.page = 1;
    ui.searchRequestSeq += 1;
    abortLiveSearchRequest();
    hideSuggestions();
    syncSearchQueryParam("");
    store.set("searchResults", []);
    store.set("searchMeta", {
      currentPage: 1,
      hasNextPage: false,
      lastVisiblePage: 1,
      totalItems: 0,
      itemsPerPage: 25
    });
    store.setError("search", "");
    store.setLoading("search", false);
    render();
  });

  refs.results?.addEventListener("click", onClick);
  refs.pagination?.addEventListener("click", onClick);
  refs.suggestions?.addEventListener("click", onClick);

  renderGenreMenu();
  renderGenreSummary();
  syncTypeSummary();
  renderTypeMenu();
  syncSortSummary();
  renderSortMenu();

  const initialParams = new URLSearchParams(globalThis.location?.search || "");
  const initialQuery = String(initialParams.get("q") || "").trim();
  const initialView = String(initialParams.get("view") || "").trim();
  if (initialQuery && refs.globalSearchInput) {
    refs.globalSearchInput.value = initialQuery;
    ui.query = initialQuery;
    if (initialView === "search") {
      void performQuery(initialQuery, 1);
    }
  }

  if (!initialQuery) {
    render();
  }

  const unsubscribe = store.subscribe(() => {
    render();
  });

  render();

  return Object.freeze({
    render,
    destroy() {
      cancelChunkRender();
      abortLiveSearchRequest();
      document.removeEventListener("click", onDocumentClick);
      document.removeEventListener("keydown", onDocumentKeydown);
      unsubscribe();
      refs.globalSearchInput?.removeEventListener("input", onGlobalInput);
      refs.globalSearchInput?.removeEventListener("keydown", onGlobalKeydown);
      refs.globalSearchInput?.removeEventListener("focus", onGlobalFocus);
      refs.results?.removeEventListener("click", onClick);
      refs.pagination?.removeEventListener("click", onClick);
      refs.suggestions?.removeEventListener("click", onClick);
    }
  });
}

export { initSearchAdvanced };


