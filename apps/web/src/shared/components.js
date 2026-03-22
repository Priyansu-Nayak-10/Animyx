/**
 * shared/components.js
 * Reusable UI render functions for Animyx.
 * Each function returns an HTML string safe for .innerHTML assignment.
 * No behavior here — all interactivity is wired by callers.
 */

/** Escape HTML to prevent XSS in rendered strings */
export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

/**
 * Render a status pill/badge.
 * @param {'plan'|'watching'|'completed'|'dropped'} status
 * @param {object} [opts]
 * @param {string} [opts.label]           Custom label (defaults to status name)
 * @param {string} [opts.extraClass]      Extra CSS classes
 * @param {string} [opts.dataAttrs]       Extra data-* attributes string
 * @returns {string} HTML string
 */
export function renderStatusBadge(status, opts = {}) {
  const labels = { plan: 'Plan', watching: 'Watching', completed: 'Done', dropped: 'Dropped' };
  const label = opts.label ?? labels[status] ?? status;
  const cls = ['status-badge', `status-badge--${status}`, opts.extraClass].filter(Boolean).join(' ');
  const attrs = opts.dataAttrs ? ` ${opts.dataAttrs}` : '';
  return `<span class="${cls}"${attrs}>${escapeHtml(label)}</span>`;
}

// ─── Loading State ────────────────────────────────────────────────────────────

/**
 * Render skeleton loading cards.
 * @param {number} [count=6] Number of skeleton cards to render
 * @param {'card'|'row'|'strip'} [variant='card'] Layout variant
 * @returns {string} HTML string
 */
export function renderLoadingState(count = 6, variant = 'card') {
  const items = Array.from({ length: count }, (_, i) =>
    `<div class="skeleton-item skeleton-item--${variant}" aria-hidden="true" key="${i}">
      <div class="skeleton-img"></div>
      <div class="skeleton-lines">
        <div class="skeleton-line skeleton-line--title"></div>
        <div class="skeleton-line skeleton-line--short"></div>
        <div class="skeleton-line skeleton-line--shorter"></div>
      </div>
    </div>`
  ).join('');
  return `<div class="skeleton-grid skeleton-grid--${variant}" role="status" aria-label="Loading...">${items}</div>`;
}

// ─── Empty State ──────────────────────────────────────────────────────────────

/**
 * Render a friendly empty state with optional CTA.
 * @param {object} opts
 * @param {string} [opts.icon='inbox']       Material icon name
 * @param {string} opts.title                Primary message
 * @param {string} [opts.message]            Secondary message / subtitle
 * @param {string} [opts.ctaLabel]           CTA button label
 * @param {string} [opts.ctaDataAttr]        CTA data attribute string (e.g., "data-action='do-thing'")
 * @param {string} [opts.extraClass]         Extra CSS class on wrapper
 * @returns {string} HTML string
 */
export function renderEmptyState(opts = {}) {
  const icon = opts.icon ?? 'inbox';
  const title = opts.title ?? 'Nothing here yet';
  const message = opts.message ?? '';
  const cls = ['empty-state', opts.extraClass].filter(Boolean).join(' ');
  const cta = opts.ctaLabel
    ? `<button class="empty-state__cta btn-ghost" type="button" ${opts.ctaDataAttr ?? ''}>${escapeHtml(opts.ctaLabel)}</button>`
    : '';
  return `
    <div class="${cls}" role="status">
      <span class="empty-state__icon material-icons" aria-hidden="true">${escapeHtml(icon)}</span>
      <h3 class="empty-state__title">${escapeHtml(title)}</h3>
      ${message ? `<p class="empty-state__message">${escapeHtml(message)}</p>` : ''}
      ${cta}
    </div>
  `;
}

// ─── Error State ──────────────────────────────────────────────────────────────

/**
 * Render an error state with retry button.
 * The retry button uses data-action so callers can bind via event delegation.
 * @param {object} opts
 * @param {string} [opts.message]          Error message
 * @param {string} [opts.retryDataAttr]    data-* attribute for retry btn (e.g. "data-action='retry-load'")
 * @param {string} [opts.retryLabel]       Retry button label
 * @param {string} [opts.extraClass]       Extra CSS class
 * @returns {string} HTML string
 */
export function renderErrorState(opts = {}) {
  const message = opts.message ?? 'Something went wrong. Please try again.';
  const retryLabel = opts.retryLabel ?? 'Retry';
  const cls = ['error-state', opts.extraClass].filter(Boolean).join(' ');
  const retry = opts.retryDataAttr
    ? `<button class="error-state__retry btn-ghost" type="button" ${opts.retryDataAttr}>${escapeHtml(retryLabel)}</button>`
    : '';
  return `
    <div class="${cls}" role="alert">
      <span class="error-state__icon material-icons" aria-hidden="true">error_outline</span>
      <p class="error-state__message">${escapeHtml(message)}</p>
      ${retry}
    </div>
  `;
}

// ─── Section Container ────────────────────────────────────────────────────────

/**
 * Render a standard section wrapper with title.
 * @param {object} opts
 * @param {string} opts.title              Section heading
 * @param {string} opts.content            Inner HTML (not escaped — caller responsible)
 * @param {string} [opts.id]               Section element id
 * @param {string} [opts.action]           Optional action button HTML
 * @param {string} [opts.extraClass]       Extra CSS class
 * @returns {string} HTML string
 */
export function renderSection(opts = {}) {
  const { title, content, id, action, extraClass } = opts;
  const cls = ['section-container', extraClass].filter(Boolean).join(' ');
  const idAttr = id ? ` id="${escapeHtml(id)}"` : '';
  return `
    <section class="${cls}"${idAttr}>
      <div class="section-header">
        <h2 class="section-title">${escapeHtml(title ?? '')}</h2>
        ${action ? `<div class="section-action">${action}</div>` : ''}
      </div>
      <div class="section-body">${content ?? ''}</div>
    </section>
  `;
}
