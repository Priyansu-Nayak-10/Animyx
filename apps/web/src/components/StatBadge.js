class StatBadge extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    static get observedAttributes() {
        return ['icon', 'value', 'color', 'label'];
    }

    attributeChangedCallback() {
        this.render();
    }

    connectedCallback() {
        this.render();
    }

    render() {
        const icon = this.getAttribute('icon') || 'star';
        const value = this.getAttribute('value') || '';
        const color = this.getAttribute('color') || 'var(--text-secondary)';
        const label = this.getAttribute('label') || '';

        this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          background: var(--bg-surface);
          padding: 0.2rem 0.5rem;
          border-radius: 6px;
          border: 1px solid var(--border-glass);
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-primary);
          backdrop-filter: blur(4px);
        }
        
        .icon {
          font-family: 'Material Icons Rounded', 'Material Icons';
          font-size: 1rem;
          color: var(--badge-color, ${color});
        }

        .label {
          color: var(--text-muted);
          font-size: 0.65rem;
          margin-left: 2px;
          text-transform: uppercase;
          letter-spacing: 0.02em;
        }
      </style>
      <span class="icon" aria-hidden="true">${icon}</span>
      <span>${value}</span>
      ${label ? `<span class="label">${label}</span>` : ''}
    `;
    }
}

customElements.define('stat-badge', StatBadge);
export default StatBadge;
