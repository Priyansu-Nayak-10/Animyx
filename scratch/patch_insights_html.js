const fs = require('fs');
let html = fs.readFileSync('apps/web/pages/app.html', 'utf8');

// 1. Insert timeframe bar before .insights-kpi-strip
const timeframeBar = `            <!-- Timeframe filter -->
            <div class="insight-timeframe-bar" id="insight-timeframe-bar" aria-label="Timeframe filter">
              <button class="timeframe-btn active" data-timeframe="all" type="button">All Time</button>
              <button class="timeframe-btn" data-timeframe="year" type="button">This Year</button>
              <button class="timeframe-btn" data-timeframe="30d" type="button">Last 30 Days</button>
            </div>

`;
html = html.replace(
  '            <div class="insights-kpi-strip">',
  timeframeBar + '            <div class="insights-kpi-strip">'
);

// 2. Replace the 3 duplicate KPI cards (Completed/Watching/Plan) with Completion Rate, Streak, Studio
const oldKpiCards = `              <div class="kpi-card kpi-completed">
                <span class="kpi-label">Completed</span>
                <span id="insight-completed" class="kpi-value">0</span>
              </div>
              <div class="kpi-card kpi-watching">
                <span class="kpi-label">Watching</span>
                <span id="insight-watching" class="kpi-value">0</span>
              </div>
              <div class="kpi-card kpi-plan">
                <span class="kpi-label">Plan</span>
                <span id="insight-plan" class="kpi-value">0</span>
              </div>`;

const newKpiCards = `              <div class="kpi-card kpi-completion">
                <span class="kpi-label">Completion Rate</span>
                <span id="insight-kpi-completion-rate" class="kpi-value">0%</span>
              </div>
              <div class="kpi-card kpi-streak">
                <span class="kpi-label">Longest Streak</span>
                <span id="insight-kpi-streak" class="kpi-value">0 days</span>
              </div>
              <div class="kpi-card kpi-studio">
                <span class="kpi-label">Favorite Studio</span>
                <span id="insight-kpi-studio" class="kpi-value kpi-studio-val">—</span>
              </div>`;

const htmlAfterKpi = html.replace(oldKpiCards.replace(/\n/g, '\r\n'), newKpiCards);
if (htmlAfterKpi !== html) { html = htmlAfterKpi; console.log('KPI cards swapped (CRLF)'); }
else {
  const htmlAfterKpi2 = html.replace(oldKpiCards, newKpiCards);
  if (htmlAfterKpi2 !== html) { html = htmlAfterKpi2; console.log('KPI cards swapped (LF)'); }
  else console.error('WARNING: KPI card swap failed - check whitespace');
}

// 3. Fix legend dot colors (was using deleted --insight-purple/cyan/lavender)
html = html.replace(
  'style="background: var(--insight-purple);"',
  'style="background: var(--insight-blue);"'
);
html = html.replace(
  'style="background: var(--insight-cyan);"',
  'style="background: var(--insight-green);"'
);
html = html.replace(
  'style="background: var(--insight-lavender);"',
  'style="background: var(--insight-yellow);"'
);

// 4. Add chart tooltip div and hidden insight-completed/watching/plan spans before closing #insights-view
// We store them as hidden elements so the existing JS refs still resolve safely
const tooltipAndHidden = `          <!-- Floating chart tooltip (placed by JS) -->
          <div id="chart-tooltip" role="tooltip" aria-hidden="true"></div>
          <!-- Hidden elements kept for JS backward compat -->
          <span id="insight-completed" hidden></span>
          <span id="insight-watching" hidden></span>
          <span id="insight-plan" hidden></span>`;

// Insert before the closing </div> of #insights-view
// The insights-view ends with the closing div of insights-container then insights-view
html = html.replace(
  '        </div>\n\n        <!-- Profile View -->',
  '        ' + tooltipAndHidden + '\n        </div>\n\n        <!-- Profile View -->'
);
// Try CRLF version
if (!html.includes('chart-tooltip')) {
  html = html.replace(
    '        </div>\r\n\r\n        <!-- Profile View -->',
    '        ' + tooltipAndHidden + '\r\n        </div>\r\n\r\n        <!-- Profile View -->'
  );
}

fs.writeFileSync('apps/web/pages/app.html', html);
console.log('HTML patched successfully');
