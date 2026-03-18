import { normalizeAnime, dedupeAnimeList } from '../../core/utils.js';
import { STATUS } from '../../store.js';

export function renderAnimeGrid(container, animeList, loading = false) {
  if (loading) {
    container.innerHTML = Array.from({ length: 12 })
      .map(() => `
        <div class="anime-card skeleton" style="height: 320px; border-radius: 8px; background: rgba(167,139,250,0.08); animation: pulse 1.5s infinite;"></div>
      `)
      .join("");
    return;
  }

  if (!animeList || animeList.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="text-align:center; padding: 60px 20px; color: var(--text-muted); width: 100%; grid-column: 1 / -1;">
        <span class="material-icons" style="font-size: 3.5rem; margin-bottom: 16px; display:inline-block; opacity: 0.5;">explore_off</span>
        <h3 style="font-size: 1.2rem; margin: 0 0 8px 0; color: var(--text-primary);">Something's empty here...</h3>
        <p style="margin: 0;">No anime found for this specific criteria.</p>
      </div>
    `;
    return;
  }

  if (!document.getElementById("grid-hover-style")) {
    const hoverStyle = document.createElement("style");
    hoverStyle.id = "grid-hover-style";
    hoverStyle.textContent = `
      .anime-card .poster-container { overflow: hidden; }
      .anime-card:hover .poster-image { transform: scale(1.05); }
      .anime-grid-cell .add-hover-cover {
        position: absolute;
        inset: 0;
        background: linear-gradient(to top, rgba(46,16,101,0.88), transparent 60%);
        opacity: 0;
        transition: opacity 0.2s ease;
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        padding: 12px;
        pointer-events: none;
        border-radius: 0.875rem;
        z-index: 10;
      }
      .anime-grid-cell:hover .add-hover-cover { opacity: 1; }
      .grid-add-btn {
        background: linear-gradient(135deg, var(--purple-500), var(--purple-700));
        color: white;
        border: none;
        padding: 8px;
        border-radius: 6px;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        pointer-events: auto;
        align-items: center;
        justify-content: center;
        gap: 6px;
        transition: filter 0.2s, transform 0.2s;
        width: 100%;
        transform: translateY(10px);
      }
      .anime-grid-cell:hover .grid-add-btn { transform: translateY(0); }
      .grid-add-btn:hover { filter: brightness(1.2); }
    `;
    document.head.appendChild(hoverStyle);
  }

  const html = animeList
    .map((anime) => {
      const title = anime.title || "Unknown Title";
      const img = anime.poster || anime.image || (anime.images?.jpg?.large_image_url) || "https://via.placeholder.com/225x320?text=No+Image";
      const malId = anime.malId || anime.id || anime.mal_id || '';

      const totalEp = anime.total_episodes || anime.episodes || 0;
      const releasedEp = anime.released_episodes || anime.episodes_aired || anime.episodesReleased || 0;
      const status = anime.airing_status || anime.status || '';
      const nextAt = anime.next_airing?.timestamp || '';
      const airingDay = anime.airing_day || '';

      return `
      <div class="anime-grid-cell" style="position: relative; display: flex; flex-direction: column;">
        <anime-card
          mal-id="${malId}"
          title="${title}"
          image="${img}"
          score="${anime.score || ''}"
          episodes="${totalEp}"
          released-episodes="${releasedEp}"
          status="${status}"
          next-airing-at="${nextAt}"
          airing-day="${airingDay}"
          year="${anime.year || ''}"
          type="${anime.type || ''}"
        ></anime-card>
        <div class="add-hover-cover">
          <button class="grid-add-btn" data-action="add-library" data-id="${malId}">
            <span class="material-icons" style="font-size: 18px;">add</span> Add to List
          </button>
        </div>
      </div>
    `;
    })
    .join("");

  container.innerHTML = html;
}

export function bindHoverPreviews(containerElement, getAnimeDataFn) {
  let previewEl = document.getElementById('global-anime-preview');
  if (!previewEl) {
    previewEl = document.createElement('div');
    previewEl.id = 'global-anime-preview';
    document.body.appendChild(previewEl);
  }

  let hideTimeout;

  containerElement.addEventListener('mouseover', (e) => {
    const card = e.target.closest('.anime-card');
    if (!card) return;

    clearTimeout(hideTimeout);
    const malId = String(card.dataset.id);
    const data = getAnimeDataFn(malId);
    if (!data) return;

    let title = data.title_english;
    if (!title && Array.isArray(data.titles)) {
      const eng = data.titles.find((t) => t.type === 'English');
      if (eng) title = eng.title;
    }
    title = title || 'Unknown Title';

    const year = data.year || (data.aired?.prop?.from?.year) || '';
    const type = data.type || 'TV';
    const studio = data.studios?.[0]?.name || 'Unknown Studio';
    const score = data.score ? `\u2B50 ${data.score}` : 'N/A';
    const synopsis = data.synopsis ? data.synopsis.replace('[Written by MAL Rewrite]', '').trim() : 'No synopsis available.';
    const tags = (data.genres || [])
      .slice(0, 4)
      .map((genre) => `<span class="preview-tag" data-genre="${genre.name}">${genre.name}</span>`)
      .join('');

    previewEl.innerHTML = `
      <div class="preview-header">
        <h4 class="preview-title">${title}</h4>
        <span class="preview-year">${year}</span>
      </div>
      <div class="preview-meta">
        <span>${type}</span> &bull; <span>${studio}</span> &bull; ${score}
      </div>
      <div class="preview-synopsis">${synopsis}</div>
      <div class="preview-tags">${tags}</div>
    `;

    const rect = card.getBoundingClientRect();
    let left = rect.right + 15;
    let top = rect.top;

    if (left + 350 > window.innerWidth) {
      left = rect.left - 335;
    }
    if (top < 10) top = 10;

    if (top + previewEl.offsetHeight > window.innerHeight) {
      top = window.innerHeight - previewEl.offsetHeight - 10;
    }

    previewEl.style.left = `${left + window.scrollX}px`;
    previewEl.style.top = `${top + window.scrollY}px`;
    previewEl.classList.add('active');
  });

  containerElement.addEventListener('mouseout', (e) => {
    const card = e.target.closest('.anime-card');
    if (!card) return;
    hideTimeout = setTimeout(() => {
      previewEl.classList.remove('active');
    }, 150);
  });

  previewEl.addEventListener('mouseenter', () => clearTimeout(hideTimeout));
  previewEl.addEventListener('mouseleave', () => {
    hideTimeout = setTimeout(() => previewEl.classList.remove('active'), 150);
  });
}

export function initSeasonTabs(mainNavContainer, subNavContainer, onTabChange) {
  const mainBtns = Array.from(mainNavContainer.querySelectorAll('button[data-tab]'));
  const stripEl = subNavContainer.querySelector('[data-season-strip]');
  const yearToggle = document.getElementById('season-dropdown-toggle');
  const yearMenu = document.getElementById('season-dropdown-menu');

  const seasons = ['winter', 'spring', 'summer', 'fall'];
  const MIN_YEAR = 1980;

  function getCurrentSeason() {
    const month = new Date().getMonth();
    if (month <= 2) return 'winter';
    if (month <= 5) return 'spring';
    if (month <= 8) return 'summer';
    return 'fall';
  }

  let selectedYear = new Date().getFullYear();
  let selectedSeason = getCurrentSeason();
  let activeTab = 'season';
  let focusedYearIndex = -1;
  let yearOptions = [];

  function setYearLabel(year) {
    if (!yearToggle) return;
    yearToggle.innerHTML = `Year ${year} <span class="chevron">&#9662;</span>`;
  }

  function renderYearMenu() {
    if (!yearMenu) return;
    yearMenu.innerHTML = '';
    const current = new Date().getFullYear();
    const years = [];
    for (let yr = current + 1; yr >= MIN_YEAR; yr--) years.push(yr);
    yearOptions = years;

    years.forEach((yr) => {
      const btn = document.createElement('button');
      btn.className = 'season-dropdown-item';
      btn.textContent = `${yr}`;
      btn.setAttribute('type', 'button');
      btn.setAttribute('role', 'option');
      const isSelected = yr === selectedYear;
      btn.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      btn.tabIndex = isSelected ? 0 : -1;
      if (isSelected) btn.classList.add('active');
      btn.addEventListener('click', () => {
        selectYear(yr);
      });
      yearMenu.appendChild(btn);
    });
  }

  function closeYearMenu({ focusToggle = true } = {}) {
    if (!yearMenu || !yearToggle) return;
    yearMenu.classList.remove('open');
    yearToggle.setAttribute('aria-expanded', 'false');
    if (focusToggle) yearToggle.focus();
  }

  function openYearMenu() {
    if (!yearMenu || !yearToggle) return;
    yearMenu.classList.add('open');
    yearToggle.setAttribute('aria-expanded', 'true');
    const index = Math.max(0, yearOptions.indexOf(selectedYear));
    focusedYearIndex = index;
    const items = Array.from(yearMenu.querySelectorAll('.season-dropdown-item'));
    const focusEl = items[index] || items[0];
    focusEl?.focus?.();
    focusEl?.scrollIntoView?.({ block: 'nearest' });
  }

  function toggleYearMenu() {
    if (!yearMenu) return;
    if (yearMenu.classList.contains('open')) closeYearMenu({ focusToggle: false });
    else openYearMenu();
  }

  function selectYear(year) {
    selectedYear = year;
    setYearLabel(selectedYear);
    closeYearMenu();
    renderYearMenu();
    renderSeasons();
    if (activeTab === 'season') {
      onTabChange('season_spec', { year: selectedYear, season: selectedSeason });
    }
  }

  function renderSeasons() {
    if (!stripEl) return;
    stripEl.innerHTML = '';
    stripEl.classList.add('animate-shift');
    requestAnimationFrame(() => stripEl.classList.remove('animate-shift'));
    seasons.forEach((season) => {
      const btn = document.createElement('button');
      btn.className = `season-pill season-${season}`;
      btn.textContent = `${season.charAt(0).toUpperCase() + season.slice(1)} ${selectedYear}`;
      if (season === selectedSeason) btn.classList.add('active');
      btn.addEventListener('click', () => {
        if (selectedSeason === season) return;
        selectedSeason = season;
        renderSeasons();
        if (activeTab === 'season') {
          onTabChange('season_spec', { year: selectedYear, season: selectedSeason });
        }
      });
      stripEl.appendChild(btn);
    });
  }

  function bindYearDropdown() {
    if (!yearToggle || !yearMenu) return;
    yearToggle.addEventListener('click', () => {
      toggleYearMenu();
    });

    yearToggle.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openYearMenu();
      }
    });

    yearMenu.addEventListener('keydown', (event) => {
      if (!yearMenu.classList.contains('open')) return;
      const items = Array.from(yearMenu.querySelectorAll('.season-dropdown-item'));
      if (!items.length) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeYearMenu();
        return;
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        focusedYearIndex = Math.min(items.length - 1, Math.max(0, (focusedYearIndex >= 0 ? focusedYearIndex : 0) + delta));
        const el = items[focusedYearIndex];
        el?.focus?.();
        el?.scrollIntoView?.({ block: 'nearest' });
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        const el = items[focusedYearIndex >= 0 ? focusedYearIndex : 0];
        const yr = Number(el?.textContent || 0);
        if (yr) selectYear(yr);
      }
    });

    document.addEventListener('click', (e) => {
      if (!yearMenu.classList.contains('open')) return;
      if (yearToggle.contains(e.target) || yearMenu.contains(e.target)) return;
      closeYearMenu({ focusToggle: false });
    });
  }

  function activateSeasonTab() {
    subNavContainer.style.display = 'grid';
    renderSeasons();
    renderYearMenu();
    onTabChange('season_spec', { year: selectedYear, season: selectedSeason });
  }

  mainBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      mainBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      activeTab = btn.dataset.tab || 'season';

      if (activeTab === 'season') {
        activateSeasonTab();
      } else {
        subNavContainer.style.display = 'none';
        onTabChange(activeTab, null);
      }
    });
  });

  bindYearDropdown();
  setYearLabel(selectedYear);
  renderYearMenu();
  renderSeasons();
  onTabChange('season_spec', { year: selectedYear, season: selectedSeason });
}

export function initSeasonBrowser({ api, toast, libraryStore, modal }) {
  const viewEl = document.getElementById('season-view');
  if (!viewEl) return null;

  const mainNavContainer = document.getElementById('season-main-nav');
  const subNavContainer = document.getElementById('season-sub-nav');
  const gridContainer = document.getElementById('season-anime-grid');

  if (!mainNavContainer || !subNavContainer || !gridContainer) return null;

  let currentReqController = null;
  const localMemCache = new Map();

  function findAnimeInCache(malId) {
    for (const list of localMemCache.values()) {
      const anime = list.find((a) =>
        String(a.malId || a.mal_id || '') === String(malId)
      );
      if (anime) return anime;
    }
    return null;
  }

  async function fetchAndRender(fetchPromise, cacheKey) {
    if (localMemCache.has(cacheKey)) {
      renderAnimeGrid(gridContainer, localMemCache.get(cacheKey), false);
      return;
    }

    if (currentReqController) {
      currentReqController.abort();
    }
    currentReqController = new AbortController();

    renderAnimeGrid(gridContainer, [], true);

    try {
      const payload = await fetchPromise();

      const rawArray = Array.isArray(payload) ? payload : (payload?.data || []);
      const normalized = rawArray.map((item) => {
        const norm = normalizeAnime(item);
        if (!norm.image) {
          norm.image = 'https://via.placeholder.com/225x320?text=No+Image';
        }
        return norm;
      });
      const animeArray = dedupeAnimeList(normalized);

      localMemCache.set(cacheKey, animeArray);
      renderAnimeGrid(gridContainer, animeArray, false);
    } catch (err) {
      console.error('[SeasonBrowser] Failed to load data:', err);
      if (err.name !== 'AbortError') {
        toast?.show('Failed to fetch seasonal anime', 'error');
        renderAnimeGrid(gridContainer, [], false);
      }
    } finally {
      currentReqController = null;
    }
  }

  initSeasonTabs(mainNavContainer, subNavContainer, (tabId, params) => {
    if (tabId === 'upcoming') {
      fetchAndRender(() => api.getUpcomingAnime(1), 'upcoming');
    } else if (tabId === 'top') {
      fetchAndRender(() => api.getTop(30), 'top');
    } else if (tabId === 'season_spec') {
      const { year, season } = params;
      fetchAndRender(() => api.getSeasonalAnime(year, season, 1), `season_${year}_${season}`);
    }
  });

  bindHoverPreviews(gridContainer, (malId) => {
    return findAnimeInCache(malId);
  });

  gridContainer.addEventListener('click', (e) => {
    const addBtn = e.target.closest('button[data-action="add-library"]');
    if (!addBtn) return;

    e.stopPropagation();

    const malId = addBtn.dataset.id;
    const targetAnime = findAnimeInCache(malId);

    if (!targetAnime) {
      toast?.show('Anime data not found', 'error');
      return;
    }

    if (libraryStore) {
      libraryStore.upsert({ ...targetAnime, status: STATUS.WATCHING }, STATUS.WATCHING);
      toast?.show(`Added "${targetAnime.title || 'Anime'}" to watchlist \u2713`);
    } else {
      toast?.show('Library not available', 'error');
    }
  });

  gridContainer.addEventListener('anime-click', async (e) => {
    const { malId } = e.detail || {};
    if (!malId) return;

    const fallback = findAnimeInCache(malId);
    if (modal) {
      await modal.open(Number(malId), fallback || null);
    }
  });

  return {
    destroy() {
      localMemCache.clear();
      if (currentReqController) currentReqController.abort();
    }
  };
}
