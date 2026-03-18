const DEFAULT_STATE = Object.freeze({
  airing: [],
  trending: [],
  seasonal: [],
  top: [],
  liveUpcoming: [],
  nextEpisodes: [],
  searchResults: [],
  searchMeta: {
    currentPage: 1,
    hasNextPage: false,
    lastVisiblePage: 1,
    totalItems: 0,
    itemsPerPage: 25
  },
  news: [],
  loading: {
    airing: false,
    trending: false,
    seasonal: false,
    top: false,
    liveUpcoming: false,
    search: false,
    news: false
  },
  errors: {}
});

function clone(data) {
  if (typeof structuredClone === "function") return structuredClone(data);
  return JSON.parse(JSON.stringify(data));
}

function createDataStore(initialState = {}, options = {}) {
  const debug = Boolean(options?.debug);
  let state = clone({ ...DEFAULT_STATE, ...initialState });
  const listeners = new Set();
  let notifyQueued = false;
  let batchPrevState = null;
  let batchMeta = [];
  const enqueueMicrotask = typeof queueMicrotask === "function"
    ? queueMicrotask.bind(globalThis)
    : (fn) => Promise.resolve().then(fn);

  function debugLog(prevState, nextState, meta = {}) {
    if (!debug) return;
    const changedKeys = new Set([
      ...Object.keys(prevState || {}),
      ...Object.keys(nextState || {})
    ]);
    const changed = [...changedKeys].filter((key) => {
      return JSON.stringify(prevState?.[key]) !== JSON.stringify(nextState?.[key]);
    });
    const loadingTransitions = {};
    const prevLoading = prevState?.loading || {};
    const nextLoading = nextState?.loading || {};
    Object.keys({ ...prevLoading, ...nextLoading }).forEach((key) => {
      if (Boolean(prevLoading[key]) === Boolean(nextLoading[key])) return;
      loadingTransitions[key] = { from: Boolean(prevLoading[key]), to: Boolean(nextLoading[key]) };
    });
    const errorTransitions = {};
    const prevErrors = prevState?.errors || {};
    const nextErrors = nextState?.errors || {};
    Object.keys({ ...prevErrors, ...nextErrors }).forEach((key) => {
      const from = String(prevErrors[key] || "");
      const to = String(nextErrors[key] || "");
      if (from === to) return;
      errorTransitions[key] = { from, to };
    });

    console.groupCollapsed(
      `[DataStore] ${meta.type || "update"}${meta.key ? `:${meta.key}` : ""}`
    );
    console.log("changedKeys", changed);
    if (Object.keys(loadingTransitions).length) console.log("loadingTransitions", loadingTransitions);
    if (Object.keys(errorTransitions).length) console.log("errorTransitions", errorTransitions);
    if (meta.type === "set" || meta.type === "patch") console.log("payload", meta.payload);
    console.groupEnd();
  }

  function flushNotify() {
    notifyQueued = false;
    const prevState = batchPrevState || state;
    const meta = batchMeta.length <= 1
      ? (batchMeta[0] || { type: "update" })
      : { type: "batch", payload: batchMeta };
    batchPrevState = null;
    batchMeta = [];

    debugLog(prevState, state, meta);
    const snapshot = clone(state);
    listeners.forEach((listener) => listener(snapshot));
  }

  function scheduleNotify(meta = {}, prevState = state) {
    if (!batchPrevState) batchPrevState = prevState;
    batchMeta.push(meta || { type: "update" });
    if (notifyQueued) return;
    notifyQueued = true;
    enqueueMicrotask(flushNotify);
  }

  function getState() {
    return clone(state);
  }

  function set(key, value) {
    const prevState = state;
    state = { ...state, [key]: value };
    scheduleNotify({ type: "set", key, payload: value }, prevState);
  }

  function patch(partial) {
    const prevState = state;
    state = { ...state, ...(partial || {}) };
    scheduleNotify({ type: "patch", payload: partial || {} }, prevState);
  }

  function setLoading(key, value) {
    const prevState = state;
    state = {
      ...state,
      loading: {
        ...state.loading,
        [key]: Boolean(value)
      }
    };
    scheduleNotify({ type: "loading", key, payload: Boolean(value) }, prevState);
  }

  function setError(key, errorValue) {
    const prevState = state;
    const nextErrors = { ...state.errors };
    if (errorValue) nextErrors[key] = String(errorValue);
    else delete nextErrors[key];
    state = { ...state, errors: nextErrors };
    scheduleNotify({ type: "error", key, payload: errorValue || "" }, prevState);
  }

  function subscribe(listener) {
    if (typeof listener !== "function") return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return Object.freeze({
    getState,
    set,
    patch,
    setLoading,
    setError,
    subscribe
  });
}

export { DEFAULT_STATE, createDataStore } from './appCore.js';
