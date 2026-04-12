const fs = require('fs');
const h = fs.readFileSync('apps/web/pages/app.html', 'utf8');
const idx = h.indexOf('chart-tooltip');
const ctx = h.substring(Math.max(0, idx - 50), idx + 300).replace(/\r\n/g, '\n');
console.log('AROUND chart-tooltip:\n', ctx);
console.log('\nHas insight-completed:', h.includes('insight-completed'));
console.log('As hidden span?', h.includes('<span id="insight-completed" hidden>'));
