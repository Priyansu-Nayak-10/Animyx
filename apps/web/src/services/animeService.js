/**
 * services/animeService.js
 * Thin API service for all anime-fetch backend calls.
 * Wraps the createApiClient patterns from core/api.js for external use.
 * Callers that already have a `controller.getAnimeDetail(id)` reference
 * (library.js, season.js) do NOT need to change — this is for new call sites.
 */

import { BACKEND_URL } from '../config.js';
import { cachedFetch } from '../core/perf.js';

const BASE = BACKEND_URL;

/** GET with 30 s TTL cache + in-flight deduplication */
const get = (path, ttl = 30_000) => cachedFetch(`${BASE}${path}`, { ttl });

/** GET /anime/:malId */
export const getAnimeDetail   = (malId)            => get(`/anime/${Number(malId)}`);

/** GET /anime/search?q=...&page=N&limit=N */
export const searchAnime      = (params)           => get(`/anime/search?${new URLSearchParams(params)}`);

/** GET /anime/airing */
export const getAiringAnime   = ()                 => get('/anime/airing');

/** GET /anime/top?limit=N */
export const getTopAnime      = (limit = 24)       => get(`/anime/top?limit=${limit}`);
export const getTrendingAnime = getTopAnime;

/** GET /anime/season/:year/:season?page=N */
export const getSeasonalAnime = (year, season, page = 1) =>
  get(`/anime/season/${year}/${season}?page=${page}`);

/** GET /anime/upcoming?page=N */
export const getUpcomingAnime = (page = 1)         => get(`/anime/upcoming?page=${page}`);
