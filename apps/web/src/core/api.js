/**
 * core/api.js
 * API client and Socket.IO initialization.
 */

import { withAuthHeaders, authFetch, apiUrl, BACKEND_ORIGIN, getAccessToken } from "../config.js";

export const API_BASE = "https://api.jikan.moe/v4";
export const DEFAULT_LIVE_UPCOMING_ENDPOINT = "https://api.jikan.moe/v4/seasons/upcoming?limit=24";


const BACKEND_BASE = "/api";
const CACHE_PREFIX = "animex_v3_cache_";
const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000;

export function createApiClient(options = {}) {
    const baseUrl = options.baseUrl || API_BASE;
  const cacheTtlMs = Number(options.cacheTtlMs || DEFAULT_CACHE_TTL_MS);
  const liveUpcomingEndpoint = options.liveUpcomingEndpoint || DEFAULT_LIVE_UPCOMING_ENDPOINT;
  const fetchImpl = options.fetchImpl || fetch.bind(globalThis);
  const storage = options.storage || globalThis.localStorage;
  const activeControllers = new Map();
  const activePromises = new Map();
  let forceFailures = false;
  let forcedFailureRate = 0;
  let requestCount = 0;
  let failureCount = 0;
  let retryCount = 0;
  const maxRetries = Math.max(0, Number(options.maxRetries ?? 2));
  const retryBaseDelayMs = Math.max(50, Number(options.retryBaseDelayMs ?? 250));

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
  }

  function sweepCache() {
    if (!storage) return;
    try {
      const now = Date.now();
      for (let i = storage.length - 1; i >= 0; i--) {
        const key = storage.key(i);
        if (key && key.startsWith(CACHE_PREFIX)) {
          try {
            const raw = storage.getItem(key);
            const parsed = JSON.parse(raw);
            if (now - Number(parsed?.timestamp || 0) > cacheTtlMs) {
              storage.removeItem(key);
            }
          } catch {
            storage.removeItem(key);
          }
        }
      }
    } catch {}
  }
  
  Promise.resolve().then(sweepCache);

  function shouldSimulateFailure() {
    if (forceFailures) return true;
    if (forcedFailureRate <= 0) return false;
    return Math.random() < forcedFailureRate;
  }

  function cacheKey(endpoint) {
    return `${CACHE_PREFIX}${encodeURIComponent(endpoint)}`;
  }

  function readCache(endpoint) {
    if (!storage?.getItem) return null;
    const raw = storage.getItem(cacheKey(endpoint));
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function writeCache(endpoint, data) {
    if (!storage?.setItem) return;
    try {
      storage.setItem(cacheKey(endpoint), JSON.stringify({
        timestamp: Date.now(),
        data
      }));
    } catch {
      // Ignore cache write failures.
    }
  }

  async function request(endpoint) {
    requestCount += 1;
    const cached = readCache(endpoint);
    if (cached && (Date.now() - Number(cached.timestamp || 0)) < cacheTtlMs) return cached.data;

    if (activePromises.has(endpoint)) {
      return activePromises.get(endpoint);
    }

    const prior = activeControllers.get(endpoint);
    if (prior) prior.abort();
    const controller = new AbortController();
    activeControllers.set(endpoint, controller);

    const promise = (async () => {
      try {
        let attempt = 0;
        while (attempt <= maxRetries) {
          try {
            if (shouldSimulateFailure()) throw new Error("Simulated failure");
            const requestUrl = /^https?:\/\//i.test(String(endpoint || ""))
              ? String(endpoint)
              : (String(endpoint).startsWith('/') ? endpoint : `${baseUrl}${endpoint}`);
            
            const requestOptions = { signal: controller.signal };
            const resolvedUrl = new URL(requestUrl, globalThis.location?.origin || 'http://localhost');
            
            const isLocalRequest = resolvedUrl.origin === (globalThis.location?.origin || resolvedUrl.origin);
            const isBackendRequest = BACKEND_ORIGIN && resolvedUrl.origin === BACKEND_ORIGIN;

            if (isLocalRequest || isBackendRequest) {
              const headers = withAuthHeaders();
              if (Object.keys(headers).length > 0) {
                requestOptions.headers = headers;
              }
            }

            const response = await fetchImpl(requestUrl, requestOptions);
            if (!response.ok) {
              console.error(`[API] ${requestUrl} failed with status ${response.status}`);
              throw new Error(`Request failed (${response.status})`);
            }
            const data = await response.json();
            writeCache(endpoint, data);
            return data;
          } catch (error) {
            if (controller.signal.aborted) throw error;
            console.warn(`[API] Attempt ${attempt + 1} for ${endpoint} failed:`, error.message);
            if (attempt >= maxRetries) throw error;
            retryCount += 1;
            const delayMs = retryBaseDelayMs * (2 ** attempt);
            await wait(delayMs);
          }
          attempt += 1;
        }
      } catch (error) {
        failureCount += 1;
        console.error(`[API] Global failure for ${endpoint}:`, error.message);
        if (cached?.data) {
          console.info(`[API] Returning stale cache for ${endpoint}`);
          return cached.data;
        }
        throw error;
      } finally {
        if (activeControllers.get(endpoint) === controller) activeControllers.delete(endpoint);
        if (activePromises.get(endpoint) === promise) activePromises.delete(endpoint);
      }
    })();

    activePromises.set(endpoint, promise);
    return promise;
  }

  return Object.freeze({
    request,
    setFailureMode(enabled) {
      forceFailures = Boolean(enabled);
    },
    setFailureRate(rate) {
      const numeric = Number(rate);
      forcedFailureRate = Number.isFinite(numeric) ? Math.min(1, Math.max(0, numeric)) : 0;
    },
    getDiagnostics() {
      return {
        requestCount,
        failureCount,
        retryCount,
        forceFailures,
        forcedFailureRate
      };
    },
    getAiring(limit = 24) {
      return request(`${BACKEND_BASE}/anime/airing`);
    },
    getTrending(limit = 24) {
      return request(`${BACKEND_BASE}/anime/top?limit=${limit}`);
    },
    getSeasonal(limit = 24) {
      const now = new Date();
      const month = now.getMonth();
      const year = now.getFullYear();
      let season = 'winter';
      if (month >= 3 && month <= 5) season = 'spring';
      else if (month >= 6 && month <= 8) season = 'summer';
      else if (month >= 9 && month <= 11) season = 'fall';
      return request(`${BACKEND_BASE}/anime/season/${year}/${season}?limit=${limit}`);
    },
    getSeasonalAnime(year, season, page = 1) {
      return request(`${BACKEND_BASE}/anime/season/${year}/${season}?page=${page}`);
    },
    getUpcomingAnime(page = 1) {
      return request(`${BACKEND_BASE}/anime/upcoming?page=${page}`);
    },
    getTop(limit = 24) {
      return request(`${BACKEND_BASE}/anime/top?limit=${limit}`);
    },
    searchAnime(query, page = 1, limit = 25, filters = {}) {
      const params = new URLSearchParams({ q: String(query || '').trim(), page, limit });
      if (Array.isArray(filters.genres) && filters.genres.length) params.append('genres', filters.genres.join(','));
      if (filters.type) params.append('type', filters.type);

      const sortKey = String(filters.sort || '').toLowerCase();
      const sortMapping = {
        ratings: { order_by: 'score', sort: 'desc' },
        name_az: { order_by: 'title', sort: 'asc' },
        most_viewed: { order_by: 'members', sort: 'desc' },
        episodes: { order_by: 'episodes', sort: 'desc' }
      };
      const resolvedSort = sortMapping[sortKey] || sortMapping.most_viewed;
      params.append('order_by', resolvedSort.order_by);
      params.append('sort', resolvedSort.sort);

      const episodeBucket = String(filters.episodes || '').trim();
      if (episodeBucket === 'lt12') {
        params.append('max_episodes', '11');
      } else if (episodeBucket === '12_24') {
        params.append('min_episodes', '12');
        params.append('max_episodes', '24');
      } else if (episodeBucket === '24p') {
        params.append('min_episodes', '24');
      }

      return request(`${BACKEND_BASE}/anime/search?${params.toString()}`);
    },
    getAnimeDetail(malId) {
      return request(`${BACKEND_BASE}/anime/${Number(malId)}`);
    },
    getLiveUpcoming(limit = 100) {
      const endpoint = String(liveUpcomingEndpoint || DEFAULT_LIVE_UPCOMING_ENDPOINT);
      if (endpoint.includes("?")) return request(`${endpoint}&limit=${Number(limit || 100)}`);
      return request(`${endpoint}?limit=${Number(limit || 100)}`);
    }
  });
}

let socket = null;

export function initSocket(onNotification) {
  if (typeof io === 'undefined') {
    console.warn('[Socket] Socket.IO global not found.');
    return null;
  }
  if (socket && socket.connected) socket.disconnect();

  socket = io(BACKEND_ORIGIN, {
    transports: ['polling'],
    upgrade: false,
    reconnectionAttempts: 5,
    reconnectionDelay: 2000,
    auth: { token: getAccessToken() }
  });

  socket.on('connect', () => {
    console.log('[Socket] Connected — id:', socket.id);
    socket.emit('subscribe');
  });

  socket.on('notification', (data) => {
    if (typeof onNotification === 'function') onNotification(data);
  });

  return socket;
}
