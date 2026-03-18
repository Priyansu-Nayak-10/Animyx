const express = require('express');
const router = express.Router();
const privateRouter = express.Router();
const axios = require('axios');
const { jikanClient } = require('../utils');
const supabase = require('../database/supabase');
const { apiResponse, apiError, processAnimeList } = require('../utils');
const { validate } = require('../middleware/validate');
const { checkCache } = require('../middleware/cache');
const {
  validateQuery,
  AnimeSearchSchema,
  AnimeSeasonSchema,
  AnimeMalIdSchema,
  PaginationSchema
} = require('../middleware/schemas');

const JIKAN = process.env.JIKAN_API_URL || 'https://api.jikan.moe/v4';

// Cache TTLs (in seconds)
const TTL_24H = 24 * 60 * 60;
const TTL_12H = 12 * 60 * 60;

const NodeCache = require('node-cache');
// Basic in-memory cache for seasonal data to prevent rate limits
const CACHE_TTL = 24 * 60 * 60; // 24 hours in seconds
const seasonalCache = new NodeCache({ stdTTL: CACHE_TTL, checkperiod: 60 * 60, useClones: false });

// Allowed pass-through filter values
const ALLOWED_TYPES = ['tv', 'movie', 'ova', 'ona', 'special', 'music', 'cm', 'pv', 'tv_special'];
const ALLOWED_STATUS = ['airing', 'complete', 'upcoming'];
const ALLOWED_RATINGS = ['g', 'pg', 'pg13', 'r17', 'r', 'rx'];
const ALLOWED_ORDER_BY = ['members', 'score', 'title', 'popularity', 'start_date', 'end_date', 'favorites', 'rank', 'scored_by', 'episodes', 'mal_id'];
const ALLOWED_SORT = ['asc', 'desc'];

function toPositiveInt(value, fallback = 1) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return parsed;
}

function toBoundedLimit(value, fallback = 25, max = 25) {
    return Math.max(1, Math.min(max, toPositiveInt(value, fallback)));
}

/**
 * @swagger
 * /api/anime/top:
 *   get:
 *     summary: Get top-rated anime
 *     tags: [Anime]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, maximum: 200 }
 *     responses:
 *       200:
 *         description: Array of top anime
 */
router.get('/top', checkCache(TTL_24H), async (req, res) => {
    try {
        const page = Math.min(200, toPositiveInt(req.query.page, 1));
        const limit = toBoundedLimit(req.query.limit, 25);
        const data = await jikanClient.get(`${JIKAN}/top/anime`, { params: { page, limit } });
        const processedData = processAnimeList(data.data);
        return apiResponse(res, processedData, 200, 'Top anime');
    } catch (err) {
        return apiError(res, 'Failed to fetch top anime', 500, err);
    }
});

/**
 * @swagger
 * /api/anime/airing:
 *   get:
 *     summary: Get currently airing anime
 *     tags: [Anime]
 *     responses:
 *       200:
 *         description: Array of airing anime
 */
router.get('/airing', async (req, res) => {
    try {
        const limit = toBoundedLimit(req.query.limit, 25);
        const data = await jikanClient.get(`${JIKAN}/seasons/now`, { params: { limit } });
        const processedData = processAnimeList(data.data);
        return apiResponse(res, processedData, 200, 'Currently airing');
    } catch (err) {
        return apiError(res, 'Failed to fetch airing anime', 500, err);
    }
});

/**
 * @swagger
 * /api/anime/search:
 *   get:
 *     summary: Search anime with optional filters
 *     tags: [Anime]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema: { type: string, minLength: 1, maxLength: 120 }
 *         description: Search query string
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, maximum: 200 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 25 }
 *       - in: query
 *         name: genres
 *         schema: { type: string }
 *         description: Comma-separated Jikan genre IDs (e.g. "1,2")
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [tv, movie, ova, ona, special, music] }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [airing, complete, upcoming] }
 *       - in: query
 *         name: rating
 *         schema: { type: string, enum: [g, pg, pg13, r17, r, rx] }
 *       - in: query
 *         name: min_score
 *         schema: { type: number, minimum: 1, maximum: 10 }
 *       - in: query
 *         name: max_score
 *         schema: { type: number, minimum: 1, maximum: 10 }
 *     responses:
 *       200:
 *         description: Paginated search results
 *       400:
 *         description: Validation error
 */
router.get('/search', checkCache(TTL_12H), validateQuery(AnimeSearchSchema), async (req, res) => {
    try {
        const q = String(req.query.q || '').trim();
        const page = Math.min(200, toPositiveInt(req.query.page, 1));
        const limit = Math.max(1, Math.min(25, toPositiveInt(req.query.limit, 20)));

        // Build Jikan params — enforce strict relevancy / popularity
        const params = { q, page, limit, sfw: true, order_by: 'members', sort: 'desc' };

        const orderBy = String(req.query.order_by || '').toLowerCase();
        if (orderBy && ALLOWED_ORDER_BY.includes(orderBy)) {
            params.order_by = orderBy;
        }

        const sort = String(req.query.sort || '').toLowerCase();
        if (sort && ALLOWED_SORT.includes(sort)) {
            params.sort = sort;
        }

        // Combine genres and tags into the 'genres' parameter
        const genresRaw = String(req.query.genres || '').replace(/[^\d,]/g, '');
        const tagsRaw = String(req.query.tags || '').replace(/[^\d,]/g, '');
        const combinedGenres = [genresRaw, tagsRaw].filter(Boolean).join(',');
        if (combinedGenres) {
            params.genres = combinedGenres;
        }

        const nowYear = new Date().getFullYear();
        const yearLegacy = toPositiveInt(req.query.year, 0);
        const yearFrom = toPositiveInt(req.query.year_from, 0) || yearLegacy;
        const yearTo = toPositiveInt(req.query.year_to, 0) || yearLegacy;
        const yearMin = Math.min(yearFrom || 0, yearTo || 0);
        const yearMax = Math.max(yearFrom || 0, yearTo || 0);
        if (yearMin > 1900 && yearMax > 1900 && yearMin <= nowYear + 2 && yearMax <= nowYear + 2) {
            params.start_date = `${yearMin}-01-01`;
            params.end_date = `${yearMax}-12-31`;
        }

        if (req.query.type && ALLOWED_TYPES.includes(String(req.query.type).toLowerCase())) {
            params.type = String(req.query.type).toLowerCase();
        }

        if (req.query.status && ALLOWED_STATUS.includes(String(req.query.status).toLowerCase())) {
            params.status = String(req.query.status).toLowerCase();
        }

        if (req.query.rating && ALLOWED_RATINGS.includes(String(req.query.rating).toLowerCase())) {
            params.rating = String(req.query.rating).toLowerCase();
        }

        const minScore = Number(req.query.min_score);
        if (Number.isFinite(minScore) && minScore >= 1 && minScore <= 10) {
            params.min_score = minScore;
        }

        const maxScore = Number(req.query.max_score);
        if (Number.isFinite(maxScore) && maxScore >= 1 && maxScore <= 10) {
            params.max_score = maxScore;
        }

        const data = await jikanClient.get(`${JIKAN}/anime`, { params });
        
        // Search Result Normalization pipeline run
        const normalizedData = processAnimeList(data.data);

        const minEpisodes = toPositiveInt(req.query.min_episodes, 0);
        const maxEpisodes = toPositiveInt(req.query.max_episodes, 0);
        const hasEpisodeFilter = (minEpisodes > 0) || (maxEpisodes > 0);
        const filteredData = hasEpisodeFilter
            ? normalizedData.filter((row) => {
                const episodesRaw = Number(row?.episodes ?? row?.total_episodes ?? 0);
                if (!Number.isFinite(episodesRaw) || episodesRaw <= 0) return true; // keep unknowns
                if (minEpisodes > 0 && episodesRaw < minEpisodes) return false;
                if (maxEpisodes > 0 && episodesRaw > maxEpisodes) return false;
                return true;
            })
            : normalizedData;

        return apiResponse(res, filteredData, 200, 'Search results', { pagination: data.pagination });
    } catch (err) {
        return apiError(res, 'Search failed', 500, err);
    }
});

/**
 * @swagger
 * /api/anime/follow:
 *   post:
 *     summary: Follow an anime for update notifications
 *     tags: [Anime]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [mal_id]
 *             properties:
 *               mal_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Successfully followed
 *       400:
 *         description: Validation error
 */
privateRouter.post('/follow', async (req, res) => {
    try {
        const userId = req.user?.id;
        const malId = Number.parseInt(req.body?.mal_id, 10);

        if (!userId) return apiError(res, 'user_id is required', 400);
        if (!malId) return apiError(res, 'mal_id is required', 400);

        const { error } = await supabase
            .from('anime_follows')
            .upsert({ user_id: userId, mal_id: malId }, { onConflict: 'user_id,mal_id' });

        if (error) return apiError(res, 'Failed to follow anime', 400, error);
        return apiResponse(res, { success: true }, 200, 'Follow saved');
    } catch (err) {
        return apiError(res, 'Failed to follow anime', 500, err);
    }
});

/**
 * @swagger
 * /api/anime/follow/{malId}:
 *   delete:
 *     summary: Unfollow an anime
 *     tags: [Anime]
 *     parameters:
 *       - in: path
 *         name: malId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Successfully unfollowed
 */
privateRouter.delete('/follow/:malId', async (req, res) => {
    try {
        const userId = req.user?.id;
        const malId = Number.parseInt(req.params.malId, 10);

        if (!userId) return apiError(res, 'user_id is required', 400);
        if (!malId) return apiError(res, 'mal_id is required', 400);

        const { error } = await supabase
            .from('anime_follows')
            .delete()
            .match({ user_id: userId, mal_id: malId });

        if (error) return apiError(res, 'Failed to unfollow anime', 400, error);
        return apiResponse(res, { success: true }, 200, 'Unfollowed');
    } catch (err) {
        return apiError(res, 'Failed to unfollow anime', 500, err);
    }
});

/**
 * @swagger
 * /api/anime/following/{malId}:
 *   get:
 *     summary: Check if the current user follows a specific anime
 *     tags: [Anime]
 *     parameters:
 *       - in: path
 *         name: malId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: '{ following: boolean }'
 */
privateRouter.get('/following/:malId', async (req, res) => {
    try {
        const userId = req.user?.id;
        const malId = Number.parseInt(req.params.malId, 10);
        if (!userId) return apiError(res, 'Unauthorized', 401);
        if (!malId) return apiError(res, 'mal_id is required', 400);

        const { data, error } = await supabase
            .from('anime_follows')
            .select('id')
            .match({ user_id: userId, mal_id: malId })
            .maybeSingle();

        if (error) throw error;
        return apiResponse(res, { following: Boolean(data?.id) }, 200);
    } catch (err) {
        return apiError(res, 'Failed to check follow status', 500, err);
    }
});

/**
 * @swagger
 * /api/anime/season/{year}/{season}:
 *   get:
 *     summary: Get seasonal anime
 *     tags: [Anime]
 *     parameters:
 *       - in: path
 *         name: year
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: season
 *         required: true
 *         schema: { type: string, enum: [winter, spring, summer, fall] }
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Seasonal anime array
 */
router.get('/season/:year/:season', async (req, res) => {
    try {
        const year = Number.parseInt(req.params.year, 10);
        const season = String(req.params.season || '').toLowerCase();
        const page = Math.min(200, toPositiveInt(req.query.page, 1));
        const limit = toBoundedLimit(req.query.limit, 25);

        if (!year || !['winter', 'spring', 'summer', 'fall'].includes(season)) {
            return apiError(res, 'Invalid year or season', 400);
        }

        const cacheKey = `season_${year}_${season}_page_${page}_limit_${limit}`;
        const cached = seasonalCache.get(cacheKey);
        if (cached) {
            return apiResponse(res, cached.data, 200, 'Seasonal anime (cached)', { pagination: cached.pagination });
        }

        const data = await jikanClient.get(`${JIKAN}/seasons/${year}/${season}`, { params: { page, limit } });
        const processedData = processAnimeList(data.data);

        seasonalCache.set(cacheKey, {
            data: processedData,
            pagination: data.pagination
        });

        return apiResponse(res, processedData, 200, 'Seasonal anime', { pagination: data.pagination });
    } catch (err) {
        return apiError(res, 'Failed to fetch seasonal anime', 500, err);
    }
});

/**
 * @swagger
 * /api/anime/upcoming:
 *   get:
 *     summary: Get upcoming anime
 *     tags: [Anime]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Upcoming anime array
 */
router.get('/upcoming', async (req, res) => {
    try {
        const page = Math.min(200, toPositiveInt(req.query.page, 1));
        const limit = toBoundedLimit(req.query.limit, 25);
        const cacheKey = `upcoming_page_${page}_limit_${limit}`;

        const cached = seasonalCache.get(cacheKey);
        if (cached) {
            return apiResponse(res, cached.data, 200, 'Upcoming anime (cached)', { pagination: cached.pagination });
        }

        const data = await jikanClient.get(`${JIKAN}/seasons/upcoming`, { params: { page, limit } });
        const processedData = processAnimeList(data.data);

        seasonalCache.set(cacheKey, {
            data: processedData,
            pagination: data.pagination
        });

        return apiResponse(res, processedData, 200, 'Upcoming anime', { pagination: data.pagination });
    } catch (err) {
        return apiError(res, 'Failed to fetch upcoming anime', 500, err);
    }
});

/**
 * @swagger
 * /api/anime/{malId}:
 *   get:
 *     summary: Get full details for a single anime by MAL ID
 *     tags: [Anime]
 *     parameters:
 *       - in: path
 *         name: malId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Anime detail object
 *       404:
 *         description: Not found
 */
router.get('/:malId', async (req, res) => {
    try {
        const malId = Number.parseInt(req.params.malId, 10);
        if (!malId) return apiError(res, 'Invalid malId', 400);
        const data = await jikanClient.get(`${JIKAN}/anime/${malId}/full`);
        return apiResponse(res, data.data, 200);
    } catch (err) {
        return apiError(res, 'Anime not found', 404, err);
    }
});

/**
 * @swagger
 * /api/anime/{malId}/relations:
 *   get:
 *     summary: Get relations (sequels, prequels, etc.) for an anime
 *     tags: [Anime]
 *     parameters:
 *       - in: path
 *         name: malId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Relations data
 */
router.get('/:malId/relations', async (req, res) => {
    try {
        const malId = Number.parseInt(req.params.malId, 10);
        if (!malId) return apiError(res, 'Invalid malId', 400);
        const data = await jikanClient.get(`${JIKAN}/anime/${malId}/relations`);
        return apiResponse(res, data.data, 200, 'Relations');
    } catch (err) {
        return apiError(res, 'Failed to fetch relations', 500, err);
    }
});

module.exports = { publicRouter: router, privateRouter };
