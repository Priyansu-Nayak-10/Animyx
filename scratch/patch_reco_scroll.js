const fs = require('fs');
let css = fs.readFileSync('apps/web/src/styles/main.css', 'utf8');

const oldBlock = `    scrollbar-gutter: stable;
    overscroll-behavior: contain;
}

.recommendations-container .card-title {`;

const newBlock = `    scrollbar-gutter: stable;
    overscroll-behavior: contain;
    /* Smooth scrolling */
    scroll-behavior: smooth;
    -webkit-overflow-scrolling: touch;
    /* GPU layer — eliminates main-thread repaint during scroll */
    will-change: scroll-position;
    transform: translateZ(0);
    /* Layout containment */
    contain: strict;
}

.recommendations-container .card-title {`;

let updated = css.replace(oldBlock.replace(/\n/g, '\r\n'), newBlock);
if (updated === css) updated = css.replace(oldBlock, newBlock);

if (updated === css) {
  // Find by partial key
  const idx = css.indexOf('overscroll-behavior: contain;\r\n}\r\n\r\n.recommendations-container .card-title {');
  if (idx !== -1) {
    updated = css.substring(0, idx + 'overscroll-behavior: contain;'.length) +
      '\r\n    /* Smooth scrolling */\r\n    scroll-behavior: smooth;\r\n    -webkit-overflow-scrolling: touch;\r\n    /* GPU layer — eliminates main-thread repaint during scroll */\r\n    will-change: scroll-position;\r\n    transform: translateZ(0);\r\n    /* Layout containment */\r\n    contain: strict;' +
      css.substring(idx + 'overscroll-behavior: contain;'.length);
    console.log('Patched via partial key CRLF');
  } else {
    console.error('Could not find anchor. Manual check needed.');
    process.exit(1);
  }
} else {
  console.log('Patched successfully');
}

fs.writeFileSync('apps/web/src/styles/main.css', updated);
console.log('Done');
