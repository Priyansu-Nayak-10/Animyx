const fs = require('fs');
let c = fs.readFileSync('apps/web/src/styles/main.css', 'utf8');

c = c.replace(/--chart-purple: #7C3AED;/, '--chart-red: #EF4444;');
c = c.replace(/--chart-blue: #3B82F6;/, '--chart-orange: #F97316;');
c = c.replace(/--chart-cyan: #06B6D4;/, '--chart-yellow: #EAB308;');
c = c.replace(/--chart-green: #22C55E;/, '--chart-green: #22C55E;');
c = c.replace(/--chart-orange: #F59E0B;/, '--chart-blue: #3B82F6;');
c = c.replace(/--chart-pink: #EC4899;/, '--chart-indigo: #6366F1;\n    --chart-violet: #A855F7;');

c = c.replace(/--insight-purple: hsl\(263, 90%, 65%\);/, '--insight-red: hsl(360, 84%, 60%);');
c = c.replace(/--insight-violet: hsl\(258, 90%, 58%\);/, '--insight-orange: hsl(25, 95%, 53%);');
c = c.replace(/--insight-orchid: hsl\(272, 85%, 62%\);/, '--insight-yellow: hsl(45, 93%, 47%);');
c = c.replace(/--insight-pink: hsl\(292, 90%, 61%\);/, '--insight-green: hsl(142, 71%, 45%);');
c = c.replace(/--insight-cyan: hsl\(186, 94%, 60%\);/, '--insight-blue: hsl(217, 91%, 60%);');
c = c.replace(/--insight-lavender: hsl\(255, 92%, 76%\);/, '--insight-indigo: hsl(239, 84%, 67%);');
c = c.replace(/--insight-rose: hsl\(351, 95%, 68%\);/, '--insight-violet: hsl(271, 91%, 65%);');
c = c.replace(/--insight-amber: hsl\(45, 100%, 55%\);/, '');

fs.writeFileSync('apps/web/src/styles/main.css', c);
console.log('Done');
