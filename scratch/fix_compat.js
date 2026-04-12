const fs = require('fs');
let h = fs.readFileSync('apps/web/pages/app.html', 'utf8');

// 1. Give the already-existing chart-tooltip div an id (it has class not id)
h = h.replace(
  '<div id="chart-tooltip" class="chart-tooltip"></div>',
  '<div id="chart-tooltip" class="chart-tooltip" role="tooltip" aria-hidden="true"></div>'
);
// If it only has class (no id already)
h = h.replace(
  '<div class="chart-tooltip"></div>',
  '<div id="chart-tooltip" class="chart-tooltip" role="tooltip" aria-hidden="true"></div>'
);

// 2. Inject hidden compat spans inside #insights-view, right before its closing </div>
// insights-view closes just before #profile-view starts
const profileViewIdx = h.indexOf('id="profile-view"');
if (profileViewIdx === -1) { console.error('profile-view not found'); process.exit(1); }

// Walk backward from profile-view to find the closing </div> of insights-view
const before = h.substring(0, profileViewIdx);
const lastDivIdx = before.lastIndexOf('</div>');

const compatSpans = `
          <!-- Hidden backward-compat spans so existing JS refs resolve safely -->
          <span id="insight-completed" hidden></span>
          <span id="insight-watching" hidden></span>
          <span id="insight-plan" hidden></span>`;

// Insert compat spans INSIDE insights-view (before its last </div>)
// Check not already there
if (!h.includes('id="insight-completed"')) {
  h = h.substring(0, lastDivIdx) + compatSpans + '\n        ' + h.substring(lastDivIdx);
  console.log('Compat spans injected');
} else {
  console.log('Compat spans already present');
}

fs.writeFileSync('apps/web/pages/app.html', h);
console.log('Done');
