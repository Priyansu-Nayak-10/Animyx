/**
 * features/dashboard/utils.js
 * Consolidated shared utility functions for the Animex dashboard.
 */

export function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function polarToCartesian(cx, cy, r, deg) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

export function describeDonutArc(cx, cy, outerR, innerR, startDeg, endDeg) {
  const o1 = polarToCartesian(cx, cy, outerR, startDeg);
  const o2 = polarToCartesian(cx, cy, outerR, endDeg);
  const i1 = polarToCartesian(cx, cy, innerR, endDeg);
  const i2 = polarToCartesian(cx, cy, innerR, startDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return [
    `M ${o1.x} ${o1.y}`,
    `A ${outerR} ${outerR} 0 ${large} 1 ${o2.x} ${o2.y}`,
    `L ${i1.x} ${i1.y}`,
    `A ${innerR} ${innerR} 0 ${large} 0 ${i2.x} ${i2.y}`,
    'Z'
  ].join(' ');
}

export function topGenres(items, limit = 3) {
  const counts = new Map();
  items.forEach((item) => {
    (item?.genres || []).forEach((genre) => {
      const key = String(genre || "").trim();
      if (!key) return;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

export function topGenresWithOthers(items, limit = 3) {
  const sorted = topGenres(items, Number.MAX_SAFE_INTEGER);
  if (sorted.length <= limit) return sorted;
  const head = sorted.slice(0, limit);
  const othersCount = sorted
    .slice(limit)
    .reduce((sum, [, count]) => sum + Number(count || 0), 0);
  if (othersCount > 0) head.push(["Others", othersCount]);
  return head;
}

export function topGenreNames(items) {
  const counts = new Map();
  items.forEach((item) => {
    (item?.genres || []).forEach((genre) => {
      const key = String(genre || "").trim();
      if (!key) return;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
}

export function derivePersonality(stats) {
  if (stats.completed >= 20) return { name: "Completionist", desc: "You close arcs and finish long runs consistently." };
  if (stats.watching >= 8) return { name: "Binge Explorer", desc: "You keep multiple ongoing stories active." };
  if (stats.plan >= 10) return { name: "Curator", desc: "You build deep queues before committing to a show." };
  return { name: "Rising Otaku", desc: "Your library is growing with a balanced watch pace." };
}

export function relativeTime(ts) {
  if (!ts) return "";
  const diff = Date.now() - Number(ts);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
