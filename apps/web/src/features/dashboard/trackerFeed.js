/**
 * features/dashboard/trackerFeed.js
 */

import { authFetch, apiUrl } from "../../config.js";
import { relativeTime, escapeHtml } from "./utils.js";

const TRACKER_NOTIF_CACHE_KEY = "animex_tracker_notif_cache_v1";

function renderTrackerItems(container, items) {
  if (!container) return;
  if (!items.length) {
    container.innerHTML = `
      <div class="tracker-empty">
        <span class="material-icons">sensors_off</span>
        <p>No active synchronization data.</p>
      </div>`;
    return;
  }
  container.innerHTML = items.map((n) => {
    const time = relativeTime(n.created_at || n.ts);
    const message = escapeHtml(n.message || "New activity detected");
    return `
    <div class="tracker-item" data-type="${escapeHtml(n.type)}">
      <div class="terminal-content">${message}</div>
      <div class="terminal-time">${time}</div>
    </div>`;
  }).join("");
}

export function initTrackerFeed({ libraryStore, milestones = null, userId = null }) {
  const listEl = document.getElementById("tracker-feed-list");
  const countBadge = document.getElementById("tracker-count-badge");
  const liveBadge = document.getElementById("tracker-live-badge");
  if (!listEl) return { destroy() { }, addEvent() { } };

  let backendItems = [];
  let localItems = [];

  function buildLocalItems() {
    const watching = libraryStore.getByStatus?.("watching") || [];
    return watching.map((a) => ({
      type: "TRACKING",
      title: String(a?.title || "Unknown"),
      message: `Tracking "${a?.title}" — ${a?.episodes ? `${a.progress || 0}/${a.episodes} eps` : "airing"}`,
      ts: a?.updatedAt || 0
    }));
  }

  function merge() {
    const all = [
      ...backendItems.map((n) => ({
        type: n.type || "TRACKING",
        title: n.message || String(n.type || ""),
        message: n.message,
        created_at: n.created_at ? new Date(n.created_at).getTime() : Date.now()
      })),
      ...localItems
    ];
    const seen = new Set();
    return all.filter((item) => {
      const key = item.title;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function render() {
    localItems = buildLocalItems();
    const items = merge();
    renderTrackerItems(listEl, items);

    if (countBadge) {
      const count = items.length;
      if (count > 0) {
        countBadge.textContent = count > 99 ? "99+" : String(count);
        countBadge.hidden = false;
      } else {
        countBadge.hidden = true;
      }
    }

    if (liveBadge) {
      if (localItems.length > 0) {
        liveBadge.innerHTML = `<span class="live-badge-glow"></span>LIVE HUD`;
        liveBadge.hidden = false;
        liveBadge.classList.add('label-live');
      } else {
        liveBadge.hidden = true;
      }
    }
  }

  async function fetchFromBackend() {
    try {
      const allItems = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const res = await authFetch(apiUrl(`/notifications/me?page=${page}&limit=100`), {
          signal: AbortSignal.timeout(4000)
        });
        if (!res.ok) return;
        const json = await res.json();
        const items = Array.isArray(json?.data) ? json.data : [];
        if (items.length === 0) break;
        allItems.push(...items);
        const meta = json?.meta;
        if (!meta?.hasNext) hasMore = false;
        else {
          page += 1;
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }

      backendItems = allItems;
      try { localStorage.setItem(TRACKER_NOTIF_CACHE_KEY, JSON.stringify(backendItems)); } catch { }
      milestones?.onNotificationsLoaded?.(backendItems);
    } catch {
      try {
        const raw = localStorage.getItem(TRACKER_NOTIF_CACHE_KEY);
        backendItems = raw ? JSON.parse(raw) : [];
      } catch { backendItems = []; }
    }
    render();
  }

  function addEvent(eventData) {
    if (!eventData) return;
    backendItems.unshift({
      type: eventData.type || "SEQUEL_ANNOUNCED",
      message: eventData.message || "New update",
      created_at: new Date().toISOString()
    });
    milestones?.onNotificationsLoaded?.(backendItems);
    render();
  }

  const unsub = libraryStore.subscribe?.(render);
  render();
  void fetchFromBackend();

  return Object.freeze({ render, addEvent, destroy() { unsub?.(); } });
}
