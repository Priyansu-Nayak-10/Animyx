function renderAnimeGrid(container, animeList, loading = false) {
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

export { renderAnimeGrid } from './season.js';
