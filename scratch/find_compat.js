const fs = require('fs');
let h = fs.readFileSync('apps/web/pages/app.html', 'utf8');
const all = [...h.matchAll(/insight-completed/g)].map(m => {
  const ctx = h.substring(Math.max(0, m.index - 40), m.index + 80).replace(/\r\n/g, '|');
  return { pos: m.index, ctx };
});
console.log(JSON.stringify(all, null, 2));
