const fs = require('fs');
let css = fs.readFileSync('apps/web/src/styles/main.css', 'utf8');

// 1. On .reco-card base: replace the duplicate transition with will-change + contain
//    so the browser can composite it without a full paint
const oldRecoCard = `    transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
    position: relative;
    overflow: hidden;
}`;
const newRecoCard = `    /* transition managed by enhancements.css — no duplicate here */
    position: relative;
    overflow: hidden;
    /* GPU compositing — prevents scroll from triggering repaint on every card */
    will-change: transform;
    contain: layout style;
}`;

let updated = css.replace(oldRecoCard.replace(/\n/g, '\r\n'), newRecoCard);
if (updated === css) updated = css.replace(oldRecoCard, newRecoCard);

if (updated === css) {
  console.error('reco-card patch not applied — target not found');
  process.exit(1);
}
console.log('reco-card base patched');

// 2. Also promote .reco-thumb for zoom transitions (avoids stutter during hover when scrolling)
const oldThumb = `.reco-thumb {\r\n    width: 100%;\r\n    height: 100%;\r\n    object-fit: cover;\r\n    display: block;\r\n}`;
const newThumb = `.reco-thumb {\r\n    width: 100%;\r\n    height: 100%;\r\n    object-fit: cover;\r\n    display: block;\r\n    /* Promotes img to its own compositor layer for smooth hover zoom */\r\n    will-change: filter;\r\n    transform: translateZ(0);\r\n}`;
updated = updated.replace(oldThumb, newThumb);
if (updated.includes('.reco-thumb {\r\n    width: 100%;')) {
  console.log('reco-thumb found but patch not applied — check whitespace');
} else {
  console.log('reco-thumb patched');
}

fs.writeFileSync('apps/web/src/styles/main.css', updated);
console.log('Done');
