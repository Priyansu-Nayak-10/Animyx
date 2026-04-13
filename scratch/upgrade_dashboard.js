const fs = require('fs');
let code = fs.readFileSync('apps/web/src/features/dashboard/dashboard.js', 'utf8');

// 1. GENRE_META patch
const oldGenreText = `const GENRE_META = {
  action: { icon: "local_fire_department", color: "#8b5cf6" },
  adventure: { icon: "explore", color: "#a78bfa" },
  comedy: { icon: "sentiment_very_satisfied", color: "#c4b5fd" },
  drama: { icon: "theater_comedy", color: "#7c3aed" },
  fantasy: { icon: "auto_fix_high", color: "#9333ea" },
  romance: { icon: "favorite", color: "#d8b4fe" },
  "sci-fi": { icon: "rocket_launch", color: "#a78bfa" },
  slice: { icon: "local_cafe", color: "#c4b5fd" },
  mystery: { icon: "search", color: "#6d28d9" },
  thriller: { icon: "bolt", color: "#7e22ce" },
  horror: { icon: "psychology", color: "#581c87" },
  sports: { icon: "sports_baseball", color: "#9333ea" },
  supernatural: { icon: "visibility", color: "#8b5cf6" },
  isekai: { icon: "vpn_key", color: "#a78bfa" },
  mecha: { icon: "smart_toy", color: "#b7abd9" }
};`;

const newGenreText = `const GENRE_META = {
  action: { icon: "local_fire_department", color: "var(--insight-red)" },
  adventure: { icon: "explore", color: "var(--insight-orange)" },
  comedy: { icon: "sentiment_very_satisfied", color: "var(--insight-yellow)" },
  drama: { icon: "theater_comedy", color: "var(--insight-blue)" },
  fantasy: { icon: "auto_fix_high", color: "var(--insight-violet)" },
  romance: { icon: "favorite", color: "var(--insight-pink, #f472b6)" }, /* fallback if pink missing */
  "sci-fi": { icon: "rocket_launch", color: "var(--insight-blue)" },
  slice: { icon: "local_cafe", color: "var(--insight-green)" },
  mystery: { icon: "search", color: "var(--insight-indigo)" },
  thriller: { icon: "bolt", color: "var(--insight-red)" },
  horror: { icon: "psychology", color: "var(--insight-violet)" },
  sports: { icon: "sports_baseball", color: "var(--insight-orange)" },
  supernatural: { icon: "visibility", color: "var(--insight-indigo)" },
  isekai: { icon: "vpn_key", color: "var(--insight-green)" },
  mecha: { icon: "smart_toy", color: "var(--insight-blue)" }
};`;

code = code.replace(oldGenreText.replace(/\n/g, '\r\n'), newGenreText);
if (code === fs.readFileSync('apps/web/src/features/dashboard/dashboard.js', 'utf8')) {
  code = code.replace(oldGenreText, newGenreText);
}

// 2. initMilestones patch
const oldMilestonesRaw = `export function initMilestones({ libraryStore }) {
  const KEY = "Animyx_dismissed_milestones", dismissed = new Set(JSON.parse(localStorage.getItem(KEY) || "[]"));
  const milestones = [
    { id: "starter", title: "Rising Star", threshold: 1, text: "Completed your first anime!", icon: "star" },
    { id: "veteran", title: "Anime Veteran", threshold: 25, text: "Completed 25 series. True dedication!", icon: "workspace_premium" },
    { id: "legend", title: "Legendary Viewer", threshold: 100, text: "100 series finished! You are a master.", icon: "military_tech" }
  ];
  function render() {
    const stats = libraryStore.getStats(), container = document.getElementById("milestones-container"); if (!container) return;
    const avail = milestones.filter(m => stats.completed >= m.threshold && !dismissed.has(m.id));
    container.innerHTML = avail.map(m => \`<div class="milestone-toast" data-id="\${m.id}"><span class="material-icons">\${m.icon}</span><div class="milestone-content"><strong>\${m.title}</strong><p>\${m.text}</p></div><button class="milestone-close" data-action="dismiss-milestone">✕</button></div>\`).join("");
  }
  function onDismiss(e) {
    const btn = e.target.closest("[data-action='dismiss-milestone']"); if (!btn) return;
    const id = btn.closest(".milestone-toast").dataset.id; dismissed.add(id);
    localStorage.setItem(KEY, JSON.stringify([...dismissed])); render();
  }
  const el = document.getElementById("milestones-container"); el?.addEventListener("click", onDismiss);
  const unsub = libraryStore.subscribe(render); render();
  return { destroy() { unsub(); el?.removeEventListener("click", onDismiss); } };
}`;

const newMilestones = `export function initMilestones({ libraryStore }) {
  const grid = document.getElementById("milestone-grid");
  if (!grid) return { render() {}, destroy() {} };
  
  const tiles = Array.from(grid.querySelectorAll(".milestone-tile"));
  if (tiles.length !== 6) return { render() {}, destroy() {} };

  function render() {
    const stats = libraryStore.getStats();
    // 1. Lost & Found (Save first anime)
    if (stats.total >= 1) tiles[0].classList.remove("locked");
    // 2. Sequel Hunter
    if (stats.watching >= 1) tiles[1].classList.remove("locked");
    // 3. Dub Scout
    if (stats.total >= 5) tiles[2].classList.remove("locked");
    // 4. Series Finished
    if (stats.completed >= 1) tiles[3].classList.remove("locked");
    // 5. The Archivist
    if (stats.total >= 10) tiles[4].classList.remove("locked");
    // 6. Active Tracker
    if (stats.watching >= 3) tiles[5].classList.remove("locked");
  }

  const unsub = libraryStore.subscribe(render);
  render();
  return { destroy() { unsub(); } };
}`;

const oldM1 = code.indexOf('export function initMilestones({ libraryStore }) {');
const oldM2 = code.indexOf('// ── Main Dashboard Facade', oldM1);
if (oldM1 !== -1 && oldM2 !== -1) {
  code = code.substring(0, oldM1) + newMilestones + '\n\n' + code.substring(oldM2);
} else {
  console.log("Could not find old initMilestones bounds");
}

// 3. Add initTriviaCard before initDashboardModules
const triviaCode = `// ── Trivia Module ─────────────────────────────────────────────────────────────

export function initTriviaCard({ libraryStore }) {
  const titleEl = document.getElementById("promo-trivia-text");
  const subEl = document.getElementById("promo-trivia-sub");
  if (!titleEl || !subEl) return { render() {}, destroy() {} };
  
  function render() {
    const items = libraryStore.getAll().filter(i => i && i.malId);
    if (!items.length) {
      titleEl.textContent = "Start tracking your watched anime to unlock personalized trivia facts!";
      subEl.textContent = "Your anime journey";
      return;
    }
    
    // Using simple regex parse for episodes in case it's a string, or fallback to numeric helper if imported.
    const parseIntSafe = (v) => Number.parseInt(String(v).replace(/[^0-9]/g, '')) || 0;
    const getTitle = (i) => i?.title_english || i?.title || "Untitled";
    
    const facts = [];
    
    const withYear = items.filter(i => Number.isFinite(Number(i.year)) && i.year > 1900).sort((a,b) => Number(a.year) - Number(b.year));
    if (withYear.length) {
      const oldest = withYear[0];
      facts.push({
        text: \`Did you know that \${getTitle(oldest)} is the oldest anime in your history from \${oldest.year}?\`,
        sub: "From your timeline"
      });
    }
    
    const rated = items.filter(i => i.userRating > 0).sort((a,b) => b.userRating - a.userRating);
    if (rated.length) {
      const best = rated[0];
      facts.push({
        text: \`Your highest-rated masterpiece is \${getTitle(best)} at \${best.userRating}/10!\`,
        sub: "From your ratings"
      });
    }
    
    const episodic = items.filter(i => parseIntSafe(i.episodes) > 0).sort((a,b) => parseIntSafe(b.episodes) - parseIntSafe(a.episodes));
    if (episodic.length) {
      const longest = episodic[0];
      facts.push({
        text: \`\${getTitle(longest)} is the longest series you've tracked with \${parseIntSafe(longest.episodes)} episodes!\`,
        sub: "Marathon stats"
      });
    }
    
    const top = topGenres(items, 1);
    if (top && top.length) {
      facts.push({
        text: \`\${top[0][0]} is your most explored genre with \${top[0][1]} titles!\`,
        sub: "Genre focus"
      });
    }
    
    if (!facts.length) {
      facts.push({ text: "You're building an excellent taste in anime. Keep tracking!", sub: "Anime stats" });
    }
    
    // Pick the most interesting one or just randomly on this render
    // Let's seed the random by the number of items so it doesn't jitter on every single DOM update unless items change
    const pickIdx = items.length % facts.length;
    const pick = facts[pickIdx];
    
    titleEl.textContent = pick.text;
    subEl.textContent = pick.sub;
  }
  
  const unsub = libraryStore.subscribe(render);
  render();
  return { destroy() { unsub(); } };
}

`;

code = code.replace('// ── Main Dashboard Facade', triviaCode + '// ── Main Dashboard Facade');

// 4. Update initDashboardModules to include and call triviaCard and initMilestones
// Wait, initMilestones is missing from initDashboardModules altogether in the current code!
// Let's replace initDashboardModules entirely
const dashOld = `export function initDashboardModules(ctx) {
  const heroCarousel = initHeroCarousel(ctx);
  const recommendations = initRecommendations(ctx);
  const upcomingWidget = initUpcomingWidget(ctx);
  const clipCard = initClipCard(ctx);

  return Object.freeze({
    heroCarousel, recommendations, upcomingWidget, clipCard,
    render() {
      const state = ctx?.store?.getState?.() || {};
      const libraryItems = ctx?.libraryStore?.getAll?.() || [];
      heroCarousel?.render?.(getTopOngoingAnikoto(state, 10, libraryItems));
      recommendations?.render?.(); upcomingWidget?.render?.(); clipCard?.render?.();
    },
    destroy() {
      clipCard?.destroy?.(); upcomingWidget?.destroy?.(); recommendations?.destroy?.(); heroCarousel?.destroy?.();
    }
  });
}`;

const dashNew = `export function initDashboardModules(ctx) {
  const heroCarousel = typeof initHeroCarousel === 'function' ? initHeroCarousel(ctx) : null;
  const recommendations = initRecommendations(ctx);
  const upcomingWidget = initUpcomingWidget(ctx);
  const clipCard = initClipCard(ctx);
  const milestones = initMilestones(ctx);
  const triviaCard = initTriviaCard(ctx);

  return Object.freeze({
    heroCarousel, recommendations, upcomingWidget, clipCard, milestones, triviaCard,
    render() {
      const state = ctx?.store?.getState?.() || {};
      const libraryItems = ctx?.libraryStore?.getAll?.() || [];
      heroCarousel?.render?.(getTopOngoingAnikoto(state, 10, libraryItems));
      recommendations?.render?.(); upcomingWidget?.render?.(); clipCard?.render?.(); 
      milestones?.render?.(); triviaCard?.render?.();
    },
    destroy() {
      triviaCard?.destroy?.(); milestones?.destroy?.(); clipCard?.destroy?.(); upcomingWidget?.destroy?.(); recommendations?.destroy?.(); heroCarousel?.destroy?.();
    }
  });
}`;

code = code.replace(dashOld.replace(/\n/g, '\r\n'), dashNew);
if(code === fs.readFileSync('apps/web/src/features/dashboard/dashboard.js', 'utf8')){
	code = code.replace(/export function initDashboardModules[\s\S]*?\}\);/m, dashNew);
}

fs.writeFileSync('apps/web/src/features/dashboard/dashboard.js', code);
console.log('Successfully patched dashboard.js');
