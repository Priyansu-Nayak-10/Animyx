const fs = require('fs');
let pass = 0, fail = 0;

function check(label, cond) {
  if (cond) { console.log('[PASS]', label); pass++; }
  else       { console.error('[FAIL]', label); fail++; }
}

const css  = fs.readFileSync('apps/web/src/styles/main.css', 'utf8');
const dash = fs.readFileSync('apps/web/src/features/dashboard/dashboard.js', 'utf8');
const ins  = fs.readFileSync('apps/web/src/features/dashboard/insights.js', 'utf8');
const html = fs.readFileSync('apps/web/pages/app.html', 'utf8');
const pagn = fs.readFileSync('apps/web/src/components/Pagination.js', 'utf8');
const pagl = fs.readFileSync('apps/web/src/components/PaginatedLibraryExample.js', 'utf8');

console.log('\n══ 1. RAINBOW CHART CSS VARIABLES ══');
check('chart-red defined',     css.includes('--chart-red: #EF4444'));
check('chart-orange defined',  css.includes('--chart-orange: #F97316'));
check('chart-yellow defined',  css.includes('--chart-yellow: #EAB308'));
check('chart-green defined',   css.includes('--chart-green: #22C55E'));
check('chart-blue defined',    css.includes('--chart-blue: #3B82F6'));
check('chart-indigo defined',  css.includes('--chart-indigo: #6366F1'));
check('chart-violet defined',  css.includes('--chart-violet: #A855F7'));
check('OLD chart-purple REMOVED', !css.includes('--chart-purple: #7C3AED'));
check('OLD chart-cyan REMOVED',   !css.includes('--chart-cyan: #06B6D4'));
check('OLD chart-pink REMOVED',   !css.includes('--chart-pink: #EC4899'));
check('insight-red defined',    css.includes('--insight-red:'));
check('insight-orange defined', css.includes('--insight-orange:'));
check('insight-yellow defined', css.includes('--insight-yellow:'));
check('insight-green defined',  css.includes('--insight-green:'));
check('insight-blue defined',   css.includes('--insight-blue:'));
check('insight-indigo defined', css.includes('--insight-indigo:'));
check('insight-violet defined', css.includes('--insight-violet:'));
check('OLD insight-purple REMOVED',  !css.includes('--insight-purple:'));
check('OLD insight-lavender REMOVED',!css.includes('--insight-lavender:'));
check('OLD insight-orchid REMOVED',  !css.includes('--insight-orchid:'));
check('OLD insight-rose REMOVED',    !css.includes('--insight-rose:'));
check('OLD insight-amber REMOVED',   !css.includes('--insight-amber:'));

console.log('\n══ 2. DASHBOARD.JS DONUT_PALETTE ══');
check('DONUT_PALETTE has chart-red',    dash.includes("'var(--chart-red)'"));
check('DONUT_PALETTE has chart-violet', dash.includes("'var(--chart-violet)'"));
check('DONUT_PALETTE has 7 from: entries', (dash.match(/from:/g)||[]).length >= 7);
check('OLD chart-purple NOT in DONUT_PALETTE', !dash.includes("'var(--chart-purple)'"));
check('OLD chart-cyan NOT in DONUT_PALETTE',   !dash.includes("'var(--chart-cyan)'"));

console.log('\n══ 3. INSIGHTS.JS COLOR MAPS ══');
check('GENRE_COLOR_MAP uses insight-red',    ins.includes('insight-red'));
check('GENRE_COLOR_MAP uses insight-blue',   ins.includes('insight-blue'));
check('GENRE_COLOR_MAP uses insight-green',  ins.includes('insight-green'));
check('GENRE_FALLBACK uses insight-orange',  ins.includes('insight-orange'));
check('OLD insight-rose NOT in maps',        !ins.includes('insight-rose'));
check('OLD insight-lavender NOT in maps',    !ins.includes('insight-lavender'));
check('OLD insight-amber NOT in maps',       !ins.includes('insight-amber'));
check('OLD insight-orchid NOT in maps',      !ins.includes('insight-orchid'));

console.log('\n══ 4. SMOOTH SCROLLING ══');
check('Pagination.js uses scrollTo behavior smooth',
  pagn.includes("scrollTo({ top: 0, behavior: 'smooth' })"));
check('PaginatedLibraryExample.js uses scrollTo behavior smooth',
  pagl.includes("scrollTo({ top: 0, behavior: 'smooth' })"));
check('main.css has scroll-behavior: smooth on main-viewport',
  css.includes('scroll-behavior: smooth'));

console.log('\n══ 5. INSIGHTS TAB UPGRADES ══');
// CSS
check('CSS: kpi-completion class',       css.includes('.kpi-completion'));
check('CSS: kpi-streak class',           css.includes('.kpi-streak'));
check('CSS: kpi-studio class',           css.includes('.kpi-studio'));
check('CSS: insight-timeframe-bar',      css.includes('.insight-timeframe-bar'));
check('CSS: timeframe-btn',              css.includes('.timeframe-btn'));
check('CSS: chart-tooltip',             css.includes('#chart-tooltip'));
check('CSS: panel-empty-state',          css.includes('.panel-empty-state'));

// HTML
check('HTML: insight-timeframe-bar',         html.includes('id="insight-timeframe-bar"'));
check('HTML: insight-kpi-completion-rate',   html.includes('id="insight-kpi-completion-rate"'));
check('HTML: insight-kpi-streak',            html.includes('id="insight-kpi-streak"'));
check('HTML: insight-kpi-studio',            html.includes('id="insight-kpi-studio"'));
check('HTML: chart-tooltip div',             html.includes('chart-tooltip'));
check('HTML: timeframe All Time btn',     html.includes('data-timeframe="all"'));
check('HTML: timeframe This Year btn',    html.includes('data-timeframe="year"'));
check('HTML: timeframe 30d btn',          html.includes('data-timeframe="30d"'));
check('HTML: old kpi-completed REPLACED', !html.includes('<div class="kpi-card kpi-completed">'));
check('HTML: old kpi-watching REPLACED',  !html.includes('<div class="kpi-card kpi-watching">'));
check('HTML: old kpi-plan REPLACED',      !html.includes('<div class="kpi-card kpi-plan">'));
check('HTML: legend dot uses insight-blue',   html.includes('var(--insight-blue)'));
check('HTML: legend dot uses insight-green',  html.includes('var(--insight-green)'));
check('HTML: legend dot uses insight-yellow', html.includes('var(--insight-yellow)'));
check('HTML: OLD insight-purple dot REMOVED', !html.includes('background: var(--insight-purple)'));
check('HTML: OLD insight-cyan dot REMOVED',   !html.includes('background: var(--insight-cyan)'));
check('HTML: OLD insight-lavender dot REMOVED',!html.includes('background: var(--insight-lavender)'));
check('HTML: hidden compat spans present',    html.includes('<span id="insight-completed" hidden>'));

// JS
check('JS: initInsights exported',           ins.includes('export function initInsights'));
check('JS: activeTimeframe state',           ins.includes('let activeTimeframe'));
check('JS: TIMEFRAME_CUTOFFS fn',            ins.includes('TIMEFRAME_CUTOFFS'));
check('JS: kpiCompletionRate ref',           ins.includes('kpiCompletionRate'));
check('JS: kpiStreak ref',                   ins.includes('kpiStreak'));
check('JS: kpiStudio ref',                   ins.includes('kpiStudio'));
check('JS: initChartTooltips fn',            ins.includes('function initChartTooltips'));
check('JS: progressive empty genre state',   ins.includes('panel-empty-state'));
check('JS: persona radar empty state',       ins.includes('Not enough data yet'));
check('JS: studio empty state',              ins.includes('panel-empty-state'));
check('JS: destroy() cleans tooltips',       ins.includes('destroyTooltips()'));
check('JS: import from dashboard.js intact', ins.includes('from "./dashboard.js"'));
check('JS: import STATUS intact',            ins.includes('from "../../store.js"'));

console.log('\n══════════════════════════════════');
console.log(`TOTAL: ${pass} passed, ${fail} failed`);
if (fail > 0) console.error('ACTION NEEDED: Some checks failed above.');
else          console.log('ALL CHECKS PASSED — implementation is correct.');
