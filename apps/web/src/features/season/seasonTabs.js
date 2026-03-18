function initSeasonTabs(mainNavContainer, subNavContainer, onTabChange) {
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

export { initSeasonTabs } from './season.js';
