import './StatBadge.js';

class AnimeCard extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.handleClick = this.handleClick.bind(this);
    }

    static get observedAttributes() {
        return [
            'mal-id', 'title', 'image', 'score', 'episodes', 'released-episodes',
            'status', 'year', 'type', 'season', 'rank', 'source', 'next-airing-at', 'airing-day'
        ];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue !== newValue && this.isConnected) {
            this.render();
        }
    }

    connectedCallback() {
        this.render();
        this.setupListeners();
        this.startCountdown();
        this.setupIntersectionObserver();
    }

    disconnectedCallback() {
        this.removeListeners();
        this.stopCountdown();
        if (this.observer) {
            this.observer.disconnect();
        }
    }

    startCountdown() {
        this.stopCountdown();
        const nextAt = parseInt(this.getAttribute('next-airing-at'));
        if (!nextAt || isNaN(nextAt)) return;

        this.countdownInterval = setInterval(() => {
            const countdownEl = this.shadowRoot.querySelector('.countdown');
            if (countdownEl) {
                const text = buildCountdownText(nextAt);
                if (text) {
                    countdownEl.textContent = `Next: ${text}`;
                } else {
                    this.stopCountdown();
                    countdownEl.textContent = 'Airing now';
                }
            }
        }, 60000); // Update every minute
    }

    stopCountdown() {
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = null;
        }
    }

    setupListeners() {
        this.addEventListener('click', this.handleClick);

        // Setup keyboard navigation
        this.setAttribute('tabindex', '0');
        this.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.handleClick(e);
            }
        });
    }

    removeListeners() {
        this.removeEventListener('click', this.handleClick);
    }

    handleClick(e) {
        // Prevent default click handling if they clicked an action button inside (though currently none are in shadow DOM)
        // Dispatch a custom event that the parent view listens to.
        const event = new CustomEvent('anime-click', {
            detail: {
                malId: this.getAttribute('mal-id'),
                title: this.getAttribute('title'),
                image: this.getAttribute('image'),
            },
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);
    }

    setupIntersectionObserver() {
        // Lazy load image when it comes into view
        this.observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = this.shadowRoot.querySelector('.card-image');
                    const dataSrc = img?.getAttribute('data-src');
                    if (img && dataSrc) {
                        img.src = dataSrc;
                        img.removeAttribute('data-src');
                        img.classList.add('loaded');
                    }
                    this.observer.disconnect();
                }
            });
        }, { rootMargin: '50px 0px' });

        this.observer.observe(this);
    }

    render() {
        const malId = this.getAttribute('mal-id') || '';
        const title = this.getAttribute('title') || 'Unknown Anime';
        const image = this.getAttribute('image') || '';
        const score = parseFloat(this.getAttribute('score'));
        const scoreDisplay = (!isNaN(score) && score > 0) ? score.toFixed(2) : '--';
        const episodes = parseInt(this.getAttribute('episodes')) || null;
        const released = parseInt(this.getAttribute('released-episodes')) || 0;
        const year = this.getAttribute('year') || '';
        const type = this.getAttribute('type') || '';
        const status = (this.getAttribute('status') || '').toLowerCase();
        const nextAt = parseInt(this.getAttribute('next-airing-at'));
        const airingDay = this.getAttribute('airing-day');

        // Status/Rank Badge
        const rank = this.getAttribute('rank');
        let topBadgeHtml = '';
        if (rank && parseInt(rank) > 0) {
            topBadgeHtml = `<div class="top-badge">#${rank}</div>`;
        }

        const isAiring = status.includes('airing');

        const countdownText = nextAt ? buildCountdownText(nextAt) : '';

        this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          position: relative;
          cursor: pointer;
          border-radius: 16px;
          overflow: hidden;
          background: var(--bg-card, #181A2A);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          border: 1px solid var(--border-glass, rgba(255, 255, 255, 0.06));
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.35);
          height: 100%;
          outline: none;
          filter: saturate(1.02);
        }

        :host(:hover), :host(:focus-visible) {
          transform: translateY(-6px);
          box-shadow: 0 16px 32px -10px rgba(0, 0, 0, 0.55), 0 6px 12px -8px rgba(0, 0, 0, 0.35);
          border-color: var(--brand-accent, rgba(168, 85, 247, 0.4));
          filter: saturate(1.08);
        }

        :host(:focus-visible) {
            box-shadow: 0 0 0 2px var(--brand-primary, #7C3AED);
        }

        .image-container {
          position: relative;
          width: 100%;
          aspect-ratio: 2 / 3;
          background: var(--bg-main);
          overflow: hidden;
        }

        .card-image {
          width: 100%;
          height: 100%;
          object-fit: cover;
          opacity: 0;
          transition: opacity 0.4s ease, transform 0.5s ease;
        }

        .card-image.loaded {
          opacity: 1;
        }

        :host(:hover) .card-image {
          transform: scale(1.05);
        }

        .image-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(to top, var(--bg-main) 0%, rgba(46, 16, 101, 0.5) 55%, transparent 100%);
          opacity: 0.85;
          transition: opacity 0.3s ease;
        }

        :host(:hover) .image-overlay {
          opacity: 0.65;
        }

        .top-badge {
          position: absolute;
          top: 8px;
          left: 8px;
          background: linear-gradient(135deg, var(--chart-purple) 0%, var(--chart-orange) 100%);
          color: #fff;
          font-size: 0.7rem;
          font-weight: 800;
          padding: 0.15rem 0.4rem;
          border-radius: 4px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
          z-index: 2;
        }

        .stats-overlay {
          position: absolute;
          bottom: 8px;
          left: 8px;
          right: 8px;
          display: flex;
          justify-content: space-between;
          z-index: 2;
        }

        .content {
          padding: 0.75rem;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          position: relative;
        }

        .title {
          font-weight: 700;
          font-size: 0.95rem;
          color: var(--text-primary);
          line-height: 1.35;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          margin: 0;
        }

        :host(:hover) .title {
            color: var(--brand-accent, #A855F7);
        }

        .meta {
          color: var(--text-secondary);
          font-size: 0.75rem;
          display: flex;
          align-items: center;
          gap: 0.35rem;
          flex-wrap: wrap;
        }

        .meta-dot {
          width: 3px;
          height: 3px;
          border-radius: 50%;
          background: var(--text-muted);
        }

        .countdown {
          color: var(--chart-purple);
          font-weight: 600;
        }

        .airing-day {
          color: var(--chart-blue);
          font-weight: 600;
        }
      </style>

      <div class="image-container">
        ${topBadgeHtml}
        <img class="card-image" data-src="${image}" alt="${title}" loading="lazy" />
        <div class="image-overlay"></div>
        <div class="stats-overlay">
          <stat-badge icon="star" value="${scoreDisplay}" color="var(--chart-purple)"></stat-badge>
          <stat-badge icon="tag" value="${type || 'TV'}" color="var(--text-primary)"></stat-badge>
        </div>
      </div>
      
      <div class="content">
        <h3 class="title" title="${title}">${title}</h3>
        <div class="meta">
            ${isAiring ? `<span class="airing-day">Airing ${airingDay || 'Soon'}</span>` : '<span>Completed</span>'}
            <div class="meta-dot"></div>
            <span>Ep ${released || 0} / ${episodes || '?'}</span>
        </div>
        ${countdownText ? `<div class="meta"><span class="countdown">Next: ${countdownText}</span></div>` : ''}
      </div>
    `;
    }
}

customElements.define('anime-card', AnimeCard);
export default AnimeCard;

function buildCountdownText(timestamp) {
    const diff = timestamp - Date.now();
    if (diff <= 0) return null;

    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
}
