/**
 * core/core.js
 * Central State management and Selectors.
 */

import { getState, setState } from "../store.js";

export const DEFAULT_STATE = Object.freeze({
  airing: [], trending: [], seasonal: [], top: [], news: [],
  loading: { airing: false, trending: false, seasonal: false, top: false, search: false, news: false },
  errors: {}
});

function clone(d) { return JSON.parse(JSON.stringify(d)); }

export function createDataStore(initialState = {}) {
  let state = { ...DEFAULT_STATE, ...initialState };
  const listeners = new Set();

  return Object.freeze({
    getState: () => clone(state),
    set: (k, v) => { state = { ...state, [k]: v }; listeners.forEach(l => l(clone(state))); },
    patch: (p) => { state = { ...state, ...p }; listeners.forEach(l => l(clone(state))); },
    subscribe: (l) => { listeners.add(l); return () => listeners.delete(l); }
  });
}

// ── Selectors ───────────────────────────────────────────────────────────────

export function getCombinedDiscoveryState(s) {
  const all = [...(s?.seasonal || []), ...(s?.trending || []), ...(s?.top || []), ...(s?.airing || [])];
  const map = new Map();
  all.forEach(i => { if (i.malId) map.set(i.malId, i); });
  return [...map.values()];
}

export function getTopOngoingAnikoto(s, limit = 10, libraryItems = []) {
  const airing = Array.isArray(s?.airing) ? s.airing : [];
  const trending = Array.isArray(s?.trending) ? s.trending : [];
  const merged = new Map();
  [...airing, ...trending].forEach(a => { if (a.malId) merged.set(a.malId, a); });
  
  return [...merged.values()]
    .filter(a => String(a?.status || "").toLowerCase().includes("airing"))
    .slice(0, limit);
}
