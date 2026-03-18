function bindHoverPreviews(containerElement, getAnimeDataFn) {
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

    // Build inner HTML
    let title = data.title_english;
    if (!title && Array.isArray(data.titles)) {
      const eng = data.titles.find(t => t.type === 'English');
      if (eng) title = eng.title;
    }
    title = title || 'Unknown Title';

    const year = data.year || (data.aired?.prop?.from?.year) || '';
    const type = data.type || 'TV';
    const studio = data.studios?.[0]?.name || 'Unknown Studio';
    const score = data.score ? `⭐ ${data.score}` : 'N/A';
    const synopsis = data.synopsis ? data.synopsis.replace('[Written by MAL Rewrite]', '').trim() : 'No synopsis available.';
    const tags = (data.genres || []).slice(0, 4).map(g => `<span class="preview-tag" data-genre="${g.name}">${g.name}</span>`).join('');

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

    // Position calc
    const rect = card.getBoundingClientRect();
    let left = rect.right + 15;
    let top = rect.top;

    // Flip if offscreen right
    if (left + 350 > window.innerWidth) {
      left = rect.left - 335;
    }
    // Prevent top being cut off
    if (top < 10) top = 10;

    // Prevent bottom overflow
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

export { bindHoverPreviews } from './season.js';
