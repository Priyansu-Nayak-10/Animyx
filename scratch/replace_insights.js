const fs = require('fs');
let c = fs.readFileSync('apps/web/src/features/dashboard/insights.js', 'utf8');

c = c.replace(/const GENRE_COLOR_MAP = Object\.freeze\(\{[\s\S]*?\}\);/m, 
`const GENRE_COLOR_MAP = Object.freeze({
  action: "var(--insight-red)",
  fantasy: "var(--insight-violet)",
  adventure: "var(--insight-orange)",
  suspense: "var(--insight-indigo)",
  comedy: "var(--insight-yellow)",
  romance: "var(--insight-red)",
  "sci-fi": "var(--insight-blue)",
  mystery: "var(--insight-indigo)",
  drama: "var(--insight-green)",
  horror: "var(--insight-red)",
  thriller: "var(--insight-orange)",
  supernatural: "var(--insight-violet)"
});`);

c = c.replace(/const GENRE_FALLBACK_COLORS = Object\.freeze\(\[[\s\S]*?\]\);/m, 
`const GENRE_FALLBACK_COLORS = Object.freeze([
  "var(--insight-red)",
  "var(--insight-orange)",
  "var(--insight-yellow)",
  "var(--insight-green)",
  "var(--insight-blue)",
  "var(--insight-indigo)",
  "var(--insight-violet)"
]);`);

c = c.replace(/color: "#ec4899"/g, 'color: "#22c55e"');
c = c.replace(/color: "#f59e0b"/g, 'color: "#eab308"');
c = c.replace(/color: "#8b5cf6"/g, 'color: "#a855f7"');

c = c.replace(/color: "var\(--insight-purple\)"/g, 'color: "var(--insight-blue)"');
c = c.replace(/color: "var\(--insight-cyan\)"/g, 'color: "var(--insight-green)"');
c = c.replace(/color: "var\(--insight-lavender\)"/g, 'color: "var(--insight-yellow)"');

fs.writeFileSync('apps/web/src/features/dashboard/insights.js', c);
console.log('insights done');
