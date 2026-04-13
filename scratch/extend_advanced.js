const fs = require('fs');

// Patch app.html
let html = fs.readFileSync('apps/web/pages/app.html', 'utf8');
const newTilesHtml = `                    <div class="milestone-tile locked">
                      <span class="milestone-icon">&#128065;&#65039;</span>
                      <span class="milestone-name">Active Tracker</span>
                      <span class="milestone-desc">Follow 3+ airing anime</span>
                    </div>
                    <!-- Advanced Milestones -->
                    <div class="milestone-tile locked">
                      <span class="milestone-icon">&#127775;</span>
                      <span class="milestone-name">First Review</span>
                      <span class="milestone-desc">Rate your first anime</span>
                    </div>
                    <div class="milestone-tile locked">
                      <span class="milestone-icon">&#128250;</span>
                      <span class="milestone-name">Episode Rookie</span>
                      <span class="milestone-desc">Watch 10+ episodes</span>
                    </div>
                    <div class="milestone-tile locked">
                      <span class="milestone-icon">&#127871;</span>
                      <span class="milestone-name">Binge Master</span>
                      <span class="milestone-desc">Watch 500+ episodes</span>
                    </div>
                    <div class="milestone-tile locked">
                      <span class="milestone-icon">&#128081;</span>
                      <span class="milestone-name">Completionist</span>
                      <span class="milestone-desc">Finish 25+ series</span>
                    </div>
                    <div class="milestone-tile locked">
                      <span class="milestone-icon">&#128221;</span>
                      <span class="milestone-name">The Critic</span>
                      <span class="milestone-desc">Rate 25+ anime</span>
                    </div>
                    <div class="milestone-tile locked">
                      <span class="milestone-icon">&#128032;</span>
                      <span class="milestone-name">Legendary Viewer</span>
                      <span class="milestone-desc">Save 100+ anime</span>
                    </div>`;

html = html.replace(/<div class="milestone-tile locked">\s*<span class="milestone-icon">&#128065;&#65039;<\/span>\s*<span class="milestone-name">Active Tracker<\/span>\s*<span class="milestone-desc">Follow 3\+ airing anime<\/span>\s*<\/div>/, newTilesHtml);
fs.writeFileSync('apps/web/pages/app.html', html);

// Patch dashboard.js
let js = fs.readFileSync('apps/web/src/features/dashboard/dashboard.js', 'utf8');
const oldMilestones = `export function initMilestones({ libraryStore }) {
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

const newMilestones = `export function initMilestones({ libraryStore }) {
  const grid = document.getElementById("milestone-grid");
  if (!grid) return { render() {}, destroy() {} };
  
  const tiles = Array.from(grid.querySelectorAll(".milestone-tile"));
  if (tiles.length < 12) return { render() {}, destroy() {} };

  function render() {
    const stats = libraryStore.getStats();
    const items = libraryStore.getAll();
    const ratedCount = items.filter(i => i && i.userRating > 0).length;
    const epsWatched = items.reduce((sum, item) => sum + (Number(item?.watchedEpisodes || item?.progress) || 0), 0);
    
    // Tier 1
    if (stats.total >= 1) tiles[0].classList.remove("locked");
    if (stats.watching >= 1) tiles[1].classList.remove("locked");
    if (stats.total >= 5) tiles[2].classList.remove("locked");
    if (stats.completed >= 1) tiles[3].classList.remove("locked");
    if (stats.total >= 10) tiles[4].classList.remove("locked");
    if (stats.watching >= 3) tiles[5].classList.remove("locked");
    
    // Tier 2
    if (ratedCount >= 1) tiles[6].classList.remove("locked");
    if (epsWatched >= 10) tiles[7].classList.remove("locked");
    if (epsWatched >= 500) tiles[8].classList.remove("locked");
    if (stats.completed >= 25) tiles[9].classList.remove("locked");
    if (ratedCount >= 25) tiles[10].classList.remove("locked");
    if (stats.total >= 100) tiles[11].classList.remove("locked");
  }

  const unsub = libraryStore.subscribe(render);
  render();
  return { destroy() { unsub(); } };
}`;

// We have carriage returns from original replace so use regex replace ignoring newline format
js = js.replace(/export function initMilestones\(\{ libraryStore \}\) \{[\s\S]*?return \{ destroy\(\) \{ unsub\(\); \} \};\s*\}/, newMilestones);
fs.writeFileSync('apps/web/src/features/dashboard/dashboard.js', js);
console.log('Update script successful');
