const fs = require('fs');
const js = fs.readFileSync('apps/web/src/features/dashboard/dashboard.js', 'utf8');

const checks = [
  ['GENRE_META uses rainbow variables', js.includes('var(--insight-red)')],
  ['initMilestones bound to #milestone-grid', js.includes('document.getElementById(\"milestone-grid\")')],
  ['initMilestones removes locked class', js.includes('classList.remove(\"locked\")')],
  ['initTriviaCard declared', js.includes('export function initTriviaCard')],
  ['initTriviaCard wired in initDashboardModules', /triviaCard.?\=\s*initTriviaCard/.test(js)],
  ['render calls triviaCard.render', js.includes('triviaCard?.render?.()')]
];

let ok = true;
checks.forEach(function(c) {
  const name = c[0];
  const pass = c[1];
  console.log((pass ? '[PASS]' : '[FAIL]') + ' ' + name);
  if (!pass) ok = false;
});
console.log(ok ? '\nAll verifications passed!' : '\nSome verifications failed.');
