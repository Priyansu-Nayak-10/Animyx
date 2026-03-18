/**
 * features/dashboard/charts.js
 * Chart components for the Animex dashboard.
 */

import { escapeHtml, describeDonutArc } from "./utils.js";

// Premium palette — rich gradient stops per slice
export const DONUT_PALETTE = [
  { from: 'var(--chart-purple)', to: 'var(--chart-purple)' },
  { from: 'var(--chart-blue)', to: 'var(--chart-blue)' },
  { from: 'var(--chart-cyan)', to: 'var(--chart-cyan)' },
  { from: 'var(--chart-green)', to: 'var(--chart-green)' },
  { from: 'var(--chart-orange)', to: 'var(--chart-orange)' },
  { from: 'var(--chart-pink)', to: 'var(--chart-pink)' },
];

export const INSIGHT_DONUT_PALETTE = [
  { from: 'var(--insight-purple)', to: 'var(--insight-orchid)' },
  { from: 'var(--insight-cyan)', to: '#a5f3fc' },
  { from: 'var(--insight-pink)', to: '#f9a8d4' },
  { from: 'var(--insight-lavender)', to: '#ddd6fe' },
  { from: 'var(--insight-rose)', to: '#fda4af' },
  { from: 'var(--insight-amber)', to: '#fde68a' }
];

/**
 * Render a premium donut ring chart into an SVG element.
 * @param {SVGElement} svgElement
 * @param {Array<[string, number]>} entries  - [label, count] pairs
 * @param {{ cx?: number, cy?: number, outerR?: number, innerR?: number, showCenter?: boolean }} [opts]
 */
export function renderGenreDonut(svgElement, entries, opts = {}) {
  if (!svgElement) return;
  const total = entries.reduce((s, [, c]) => s + Number(c || 0), 0);
  if (!total) { svgElement.innerHTML = ''; return; }

  const {
    cx = 100, cy = 100,
    outerR = 88, innerR = 52,
    showCenter = true
  } = opts;

  const GAP_DEG = 2.2;  // gap between slices in degrees
  const uid = `dnt-${Math.random().toString(36).slice(2, 7)}`;

  // Build gradient defs
  const gradientDefs = entries.map((_, i) => {
    const c = DONUT_PALETTE[i % DONUT_PALETTE.length];
    return `<linearGradient id="${uid}-g${i}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${c.from}"/>
      <stop offset="100%" stop-color="${c.to}"/>
    </linearGradient>`;
  }).join('');

  // Glow filter
  const glowFilter = `<filter id="${uid}-glow" x="-20%" y="-20%" width="140%" height="140%">
    <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur"/>
    <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>`;

  // Slices
  let angle = -90;  // start at 12 o'clock
  const slices = entries.map(([label, count], i) => {
    const value = Number(count || 0);
    const sweep = (value / total) * 360;
    const startDeg = angle + GAP_DEG / 2;
    const endDeg = angle + sweep - GAP_DEG / 2;
    angle += sweep;
    if (sweep < 1) return '';
    const pct = Math.round((value / total) * 100);
    const path = describeDonutArc(cx, cy, outerR, innerR, startDeg, endDeg);
    return `<path
      class="donut-slice"
      d="${path}"
      fill="url(#${uid}-g${i})"
      filter="url(#${uid}-glow)"
      data-tooltip="${escapeHtml(`${label} ${pct}% — ${count}`)}"
      style="animation-delay: ${i * 0.07}s"
    />`;
  }).join('');

  // Center label
  const center = showCenter ? `
    <circle cx="${cx}" cy="${cy}" r="${innerR - 4}"
      fill="rgba(39,23,74,0.7)" />
    <text x="${cx}" y="${cy - 8}" text-anchor="middle" font-size="22"
      font-weight="800" fill="var(--text-primary)" font-family="inherit">${total}</text>
    <text x="${cx}" y="${cy + 12}" text-anchor="middle" font-size="9"
      font-weight="600" fill="var(--text-muted)" font-family="inherit" letter-spacing="1">ANIME</text>
  ` : '';

  svgElement.innerHTML = `
    <defs>${gradientDefs}${glowFilter}</defs>
    ${slices}
    ${center}
  `;
}

/**
 * Insights variant of the donut chart.
 */
export function renderInsightGenreDonut(svgElement, entries) {
  if (!svgElement) return;
  const total = entries.reduce((s, c) => s + Number(c[1] || 0), 0);
  if (!total) {
    svgElement.innerHTML = `
      <g opacity="0.7">
        <circle cx="110" cy="110" r="98" fill="none" stroke="rgba(167, 139, 250, 0.18)" stroke-width="24" stroke-dasharray="10 8"></circle>
        <circle cx="110" cy="110" r="76" fill="none" stroke="rgba(139, 92, 246, 0.18)" stroke-width="10" stroke-dasharray="2 10"></circle>
      </g>
      <circle cx="110" cy="110" r="54" fill="var(--bg-main)"/>
      <text x="110" y="106" text-anchor="middle" font-size="12" font-weight="900" fill="var(--text-primary)" font-family="inherit">No data yet</text>
      <text x="110" y="125" text-anchor="middle" font-size="8.5" font-weight="600" fill="var(--text-muted)" font-family="inherit" letter-spacing="0.6">TRACK ANIME</text>
    `;
    return;
  }

  const cx = 110, cy = 110, outerR = 100, innerR = 60, GAP = 2.2;
  const uid = `ins-${Math.random().toString(36).slice(2, 7)}`;

  const gradientDefs = entries.map((_, i) => {
    const c = INSIGHT_DONUT_PALETTE[i % INSIGHT_DONUT_PALETTE.length];
    return `<linearGradient id="${uid}-g${i}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${c.from}"/>
      <stop offset="100%" stop-color="${c.to}"/>
    </linearGradient>`;
  }).join('');

  const glowFilter = `<filter id="${uid}-glow" x="-25%" y="-25%" width="150%" height="150%">
    <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur"/>
    <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>`;

  let angle = -90;
  const slices = entries.map(([genre, count], i) => {
    const value = Number(count || 0);
    const sweep = (value / total) * 360;
    const startDeg = angle + GAP / 2;
    const endDeg = angle + sweep - GAP / 2;
    angle += sweep;
    if (sweep < 1) return '';
    const pct = Math.round((value / total) * 100);
    const path = describeDonutArc(cx, cy, outerR, innerR, startDeg, endDeg);
    return `<path class="donut-slice" d="${path}" fill="url(#${uid}-g${i})" filter="url(#${uid}-glow)"
      data-tooltip="${escapeHtml(`${genre} — ${pct}% (${count} anime)`)}" style="animation-delay:${i * 0.08}s"
      onclick="this.classList.toggle('slice-dimmed')" />`;
  }).join('');

  svgElement.innerHTML = `
    <defs>${gradientDefs}${glowFilter}</defs>
    ${slices}
    <circle cx="${cx}" cy="${cy}" r="${innerR - 5}" fill="var(--bg-main)"/>
    <text x="${cx}" y="${cy - 6}" text-anchor="middle" font-size="20" font-weight="800" fill="var(--text-primary)" font-family="inherit">${total}</text>
    <text x="${cx}" y="${cy + 13}" text-anchor="middle" font-size="8.5" font-weight="600" fill="var(--text-muted)" font-family="inherit" letter-spacing="1">ANIME</text>
  `;
}

export function renderDonutChart(container, segments, total, centerLabel, showLegend = true) {
  if (!container) return;
  if (!total) {
    container.innerHTML = `
      <svg class="insight-donut-svg" viewBox="0 0 120 120" aria-hidden="true" style="width:100%; height:100%; opacity:0.7;">
        <defs>
          <filter id="empty-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2.2" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(167, 139, 250, 0.18)" stroke-width="14" stroke-dasharray="6 8" filter="url(#empty-glow)"></circle>
        <circle cx="60" cy="60" r="33" fill="var(--bg-main)"></circle>
        <text x="60" y="58" text-anchor="middle" font-size="18" font-weight="900" fill="var(--text-primary)" font-family="inherit">&mdash;</text>
        <text x="60" y="73" text-anchor="middle" font-size="6.5" font-weight="700" fill="var(--text-muted)" font-family="inherit" letter-spacing="1">NO DATA</text>
      </svg>
    `;
    return;
  }

  const uid = `cdnt-${Math.random().toString(36).slice(2, 7)}`;
  const cx = 60, cy = 60, outerR = 54, innerR = 33, GAP = 2.5;
  const segTotal = segments.reduce((s, seg) => s + Number(seg.value || 0), 0) || 1;

  const gradientDefs = segments.map((seg, i) => {
    const c = seg.color ? { from: seg.color, to: seg.color } : INSIGHT_DONUT_PALETTE[i % INSIGHT_DONUT_PALETTE.length];
    return `<linearGradient id="${uid}-sg${i}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${c.from}" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="${c.to}"/>
    </linearGradient>`;
  }).join('');

  const glowFilter = `<filter id="${uid}-sglow" x="-30%" y="-30%" width="160%" height="160%">
    <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur"/>
    <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>`;

  let angle = -90;
  const slices = segments.filter(s => s.value > 0).map((seg, i) => {
    const sweep = (seg.value / segTotal) * 360;
    const startDeg = angle + GAP / 2;
    const endDeg = angle + sweep - GAP / 2;
    angle += sweep;
    if (sweep < 1) return '';
    const pct = Math.round((seg.value / segTotal) * 100);
    const path = describeDonutArc(cx, cy, outerR, innerR, startDeg, endDeg);
    return `<path class="donut-slice" d="${path}" fill="url(#${uid}-sg${i})" filter="url(#${uid}-sglow)"
      data-tooltip="${escapeHtml(`${seg.label}: ${seg.value} (${pct}%)`)}" style="animation-delay:${i * 0.08}s"
      onclick="this.classList.toggle('slice-dimmed')" />`;
  }).join('');

  const svgMarkup = `<svg class="insight-donut-svg" viewBox="0 0 120 120" aria-hidden="true" style="width:100%; height:100%;">
    <defs>${gradientDefs}${glowFilter}</defs>
    ${slices}
    <circle cx="${cx}" cy="${cy}" r="${innerR - 4}" fill="var(--bg-main)"/>
    <text x="${cx}" y="${cy - 5}" text-anchor="middle" font-size="14" font-weight="800" fill="var(--text-primary)" font-family="inherit">${total}</text>
    <text x="${cx}" y="${cy + 11}" text-anchor="middle" font-size="6.5" font-weight="600" fill="var(--text-muted)" font-family="inherit" letter-spacing="1">${escapeHtml(String(centerLabel || 'TOTAL').toUpperCase())}</text>
  </svg>`;

  let legend = '';
  if (showLegend) {
    legend = `<div class="insight-donut-legend" onclick="event.stopPropagation()">${segments.map((seg, i) => {
      const c = INSIGHT_DONUT_PALETTE[i % INSIGHT_DONUT_PALETTE.length];
      return `<div class="insight-legend-item" data-tooltip="${escapeHtml(`${seg.label}: ${seg.value}`)}"
        style="--legend-color:${c.from}">
        <span class="insight-legend-dot" style="background:linear-gradient(135deg,${c.from},${c.to});"></span>
        <span>${escapeHtml(seg.label)}: ${seg.value}</span>
      </div>`;
    }).join('')}</div>`;
  }

  container.innerHTML = svgMarkup + legend;
}
