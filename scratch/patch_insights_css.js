const fs = require('fs');
let css = fs.readFileSync('apps/web/src/styles/main.css', 'utf8');

// Replace old kpi-completed / kpi-watching / kpi-plan variant blocks with new ones
const oldKpiVariants = `.kpi-completed {
  --kpi-accent: #c084fc;
  --kpi-glow: rgba(192, 132, 252, 0.4);
}

.kpi-completed::before {
  background: linear-gradient(90deg, var(--insight-purple), var(--insight-orchid));
}

.kpi-watching {
  --kpi-accent: var(--insight-cyan);
  --kpi-glow: rgba(103, 232, 249, 0.34);
}

.kpi-watching::before {
  background: linear-gradient(90deg, #22d3ee, #67e8f9);
}

.kpi-plan {
  --kpi-accent: var(--insight-lavender);
  --kpi-glow: rgba(196, 181, 253, 0.34);
}

.kpi-plan::before {
  background: linear-gradient(90deg, #a78bfa, #ddd6fe);
}`;

const newKpiVariants = `.kpi-completion {
  --kpi-accent: var(--insight-green);
  --kpi-glow: rgba(34, 197, 94, 0.34);
}
.kpi-completion::before {
  background: linear-gradient(90deg, #16a34a, var(--insight-green));
}
.kpi-streak {
  --kpi-accent: var(--insight-orange);
  --kpi-glow: rgba(249, 115, 22, 0.34);
}
.kpi-streak::before {
  background: linear-gradient(90deg, #ea580c, var(--insight-orange));
}
.kpi-studio {
  --kpi-accent: var(--insight-blue);
  --kpi-glow: rgba(59, 130, 246, 0.34);
}
.kpi-studio::before {
  background: linear-gradient(90deg, #2563eb, var(--insight-blue));
}
.kpi-studio-val {
  font-size: 1rem !important;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Insight Timeframe Filter Bar ─────────────────────── */
.insight-timeframe-bar {
  display: flex;
  gap: 0.4rem;
  align-items: center;
  background: rgba(15, 10, 35, 0.55);
  border: 1px solid var(--insight-border);
  border-radius: 10px;
  padding: 0.3rem;
  width: fit-content;
  backdrop-filter: blur(12px);
  margin-bottom: 0.5rem;
}
.timeframe-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  color: rgba(239, 233, 255, 0.55);
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.35rem 0.85rem;
  border-radius: 7px;
  letter-spacing: 0.02em;
  transition: background 0.2s ease, color 0.2s ease;
  font-family: inherit;
}
.timeframe-btn:hover { color: var(--text-primary); background: rgba(255,255,255,0.06); }
.timeframe-btn.active {
  background: linear-gradient(135deg, rgba(139,92,246,0.3), rgba(99,102,241,0.25));
  color: #e0d7ff;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);
}

/* ── Floating SVG Chart Tooltip ──────────────────────── */
#chart-tooltip {
  position: fixed;
  z-index: 9999;
  background: rgba(12,8,28,0.92);
  border: 1px solid rgba(196,181,253,0.22);
  border-radius: 9px;
  padding: 0.45rem 0.85rem;
  font-size: 0.78rem;
  font-weight: 600;
  color: #e5dcff;
  pointer-events: none;
  opacity: 0;
  transform: translateY(4px);
  transition: opacity 0.15s ease, transform 0.15s ease;
  backdrop-filter: blur(12px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  white-space: nowrap;
}
#chart-tooltip.is-visible { opacity: 1; transform: translateY(0); }

/* ── Per-panel progressive empty state ──────────────── */
.panel-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 2rem 1rem;
  text-align: center;
  color: var(--text-muted);
  font-size: 0.82rem;
  opacity: 0.75;
}
.panel-empty-state .panel-empty-icon { font-size: 2rem; opacity: 0.4; }`;

// Try both LF and CRLF
const replaced = css.replace(oldKpiVariants.replace(/\n/g, '\r\n'), newKpiVariants) !== css
  ? css.replace(oldKpiVariants.replace(/\n/g, '\r\n'), newKpiVariants)
  : css.replace(oldKpiVariants, newKpiVariants);

if (replaced === css) {
  console.error('ERROR: Target block not found! Check whitespace.');
  process.exit(1);
}

fs.writeFileSync('apps/web/src/styles/main.css', replaced);
console.log('CSS updated successfully');
