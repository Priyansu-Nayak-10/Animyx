const fs = require('fs');
const css = fs.readFileSync('apps/web/src/styles/main.css', 'utf8');
const checks = [
  ['recommendations-list has scroll-behavior smooth', css.includes('scroll-behavior: smooth')],
  ['recommendations-list has webkit overflow scrolling touch', css.includes('-webkit-overflow-scrolling: touch')],
  ['recommendations-list has will-change scroll-position', css.includes('will-change: scroll-position')],
  ['recommendations-list has contain strict', css.includes('contain: strict')],
  ['reco-card has will-change transform', css.includes('will-change: transform')],
  ['reco-card has contain layout style', css.includes('contain: layout style')],
  ['reco-card duplicate transition REMOVED', !css.includes('transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease')],
  ['reco-thumb has will-change filter', css.includes('will-change: filter')],
];
let ok = true;
checks.forEach(function(item) {
  const label = item[0], pass = item[1];
  console.log((pass ? '[PASS]' : '[FAIL]') + ' ' + label);
  if (!pass) ok = false;
});
console.log(ok ? '\nAll reco scroll checks passed!' : '\nSome checks failed.');
