const fs = require('fs');
let h = fs.readFileSync('apps/web/pages/app.html', 'utf8');

// Find the closing of the insights-view section
// Structure: ...Recent Activity panel close -> secondary-grid close -> insights-container close -> insights-view close
// Then comes <!-- Profile View --> or equivalent next section

const inject = `          <!-- Floating chart tooltip -->
          <div id="chart-tooltip" role="tooltip" aria-hidden="true"></div>
          <!-- Hidden backward-compat spans so existing JS refs resolve safely -->
          <span id="insight-completed" hidden></span>
          <span id="insight-watching" hidden></span>
          <span id="insight-plan" hidden></span>
        </div>`;

// The insights-view closing is at the 3rd </div> after insight-recent-activity
// We find the position just before the Profile View comment
const marker = 'id="profile-view"';
const idx = h.indexOf(marker);
if (idx === -1) { console.error('Cannot find profile-view'); process.exit(1); }

// Find the </div> just before profile-view (with preceding whitespace/newline)
// Scan backward from idx to find where insights-view closes
const beforeProfile = h.substring(0, idx);
// The last </div> before profile-view is the insights-view closing
const lastDiv = beforeProfile.lastIndexOf('</div>');
if (lastDiv === -1) { console.error('Cannot find closing div before profile-view'); process.exit(1); }

// Make sure we haven't already injected
if (h.includes('id="chart-tooltip"')) {
  console.log('chart-tooltip already present, skipping.');
  process.exit(0);
}

// Insert inject block before the last </div> that closes insights-view
h = h.substring(0, lastDiv) + `\n${inject}\n` + h.substring(lastDiv + '</div>'.length);

fs.writeFileSync('apps/web/pages/app.html', h);
console.log('Injected compat spans and chart-tooltip successfully');
