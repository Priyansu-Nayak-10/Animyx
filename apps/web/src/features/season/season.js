

export function resolveAiringStatus(anime) {
  const total = Number(anime.total_episodes || anime.episodes || 0);
  const aired = Number(anime.released_episodes || anime.episodes_aired || anime.episodesReleased || anime.progress || 0);
  const statusStr = String(anime.airing_status || anime.status || '').toLowerCase();
  
  if (total > 0 && aired >= total) return "completed";
  if (statusStr.includes("finished") || statusStr === "completed") return "completed";
  
  const endDate = anime.aired?.to;
  if (endDate && new Date(endDate).getTime() < Date.now()) return "completed";
  
  return statusStr.includes("not yet") ? "upcoming" : "airing";
}

export function renderAnimeGrid(container, animeList, loading = false) {
  if (loading) {
    container.innerHTML = Array.from({ length: 12 })
      .map(() => `
        <article class="skeleton-card skeleton" style="--skeleton-aspect: 2/3;">
          <div class="skeleton-poster"></div>
          <div class="skeleton-body">
            <div class="skeleton-line short mb-2"></div>
            <div class="skeleton-line medium"></div>
          </div>
        </article>
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
      const rawStatus = anime.airing_status || anime.status || '';
      const resolvedStatus = resolveAiringStatus(anime) || rawStatus;
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
          status="${resolvedStatus}"
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
