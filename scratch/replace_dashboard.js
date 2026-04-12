const fs = require('fs');
let c = fs.readFileSync('apps/web/src/features/dashboard/dashboard.js', 'utf8');

c = c.replace(/export const DONUT_PALETTE = \[\s*\{\s*from:\s*'var\(--chart-purple\)',\s*to:\s*'var\(--chart-purple\)'\s*\},\s*\{\s*from:\s*'var\(--chart-blue\)',\s*to:\s*'var\(--chart-blue\)'\s*\},\s*\{\s*from:\s*'var\(--chart-cyan\)',\s*to:\s*'var\(--chart-cyan\)'\s*\},\s*\{\s*from:\s*'var\(--chart-green\)',\s*to:\s*'var\(--chart-green\)'\s*\},\s*\{\s*from:\s*'var\(--chart-orange\)',\s*to:\s*'var\(--chart-orange\)'\s*\},\s*\{\s*from:\s*'var\(--chart-pink\)',\s*to:\s*'var\(--chart-pink\)'\s*\},?\s*\];/g, 
`export const DONUT_PALETTE = [
  { from: 'var(--chart-red)', to: 'var(--chart-red)' },
  { from: 'var(--chart-orange)', to: 'var(--chart-orange)' },
  { from: 'var(--chart-yellow)', to: 'var(--chart-yellow)' },
  { from: 'var(--chart-green)', to: 'var(--chart-green)' },
  { from: 'var(--chart-blue)', to: 'var(--chart-blue)' },
  { from: 'var(--chart-indigo)', to: 'var(--chart-indigo)' },
  { from: 'var(--chart-violet)', to: 'var(--chart-violet)' },
];`);

c = c.replace(/palette\s*=\s*\[\s*"var\(--chart-purple\)",\s*"var\(--chart-blue\)",\s*"var\(--chart-cyan\)",\s*"var\(--chart-green\)",\s*"var\(--chart-orange\)",\s*"var\(--chart-pink\)"\s*\]/g, 
`palette = ["var(--chart-red)", "var(--chart-orange)", "var(--chart-yellow)", "var(--chart-green)", "var(--chart-blue)", "var(--chart-indigo)", "var(--chart-violet)"]`);

fs.writeFileSync('apps/web/src/features/dashboard/dashboard.js', c);
console.log('dashboard done');
