const fs = require('fs');
let c = fs.readFileSync('apps/web/src/styles/main.css', 'utf8');

const t1 =     /* Charts */
    --chart-purple: #7C3AED;
    --chart-blue: #3B82F6;
    --chart-cyan: #06B6D4;
    --chart-green: #22C55E;
    --chart-orange: #F59E0B;
    --chart-pink: #EC4899;;

const r1 =     /* Charts */
    --chart-red: #EF4444;
    --chart-orange: #F97316;
    --chart-yellow: #EAB308;
    --chart-green: #22C55E;
    --chart-blue: #3B82F6;
    --chart-indigo: #6366F1;
    --chart-violet: #A855F7;;

const t2 =   --insight-purple: hsl(263, 90%, 65%);
  --insight-violet: hsl(258, 90%, 58%);
  --insight-orchid: hsl(272, 85%, 62%);
  --insight-pink: hsl(292, 90%, 61%);
  --insight-cyan: hsl(186, 94%, 60%);
  --insight-lavender: hsl(255, 92%, 76%);
  --insight-rose: hsl(351, 95%, 68%);
  --insight-amber: hsl(45, 100%, 55%);;

const r2 =   --insight-red: hsl(360, 84%, 60%);
  --insight-orange: hsl(25, 95%, 53%);
  --insight-yellow: hsl(45, 93%, 47%);
  --insight-green: hsl(142, 71%, 45%);
  --insight-blue: hsl(217, 91%, 60%);
  --insight-indigo: hsl(239, 84%, 67%);
  --insight-violet: hsl(271, 91%, 65%);;

c = c.replace(t1.replace(/\n/g, '\r\n'), r1);
c = c.replace(t1, r1);
c = c.replace(t2.replace(/\n/g, '\r\n'), r2);
c = c.replace(t2, r2);

fs.writeFileSync('apps/web/src/styles/main.css', c);
