const express = require('express');
const axios = require('axios');
const { jikanClient } = require('../utils');
const supabase = require('../database/supabase');
const { apiResponse, apiError, createPaginationQuery, createPaginationMeta, paginatedResponse } = require('../utils');
const { validate } = require('../middleware/validate');
const { validateQuery, PaginationSchema } = require('../middleware/schemas');
const { recordActivity, getRecentActivities } = require('../services');

const router = express.Router();
const JIKAN = process.env.JIKAN_API_URL || 'https://api.jikan.moe/v4';

function clampText(value, max = 255) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return text.slice(0, max);
}

function parseClientTimestampMs(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  // Basic sanity bounds: after 2000-01-01 and not too far in the future.
  const min = Date.parse('2000-01-01T00:00:00.000Z');
  const max = Date.now() + (24 * 60 * 60 * 1000);
  if (n < min || n > max) return 0;
  return Math.trunc(n);
}

function isoFromMs(ms) {
  const n = parseClientTimestampMs(ms);
  return n ? new Date(n).toISOString() : null;
}

/**
 * @swagger
 * /api/users/me/followed:
 *   get:
 *     summary: Get anime the current user is following (paginated)
 *     tags: [Library]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 50 }
 *     responses:
 *       200:
 *         description: Paginated array of followed anime
 *       400:
 *         description: Invalid pagination parameters
 */
router.get('/me/followed', validateQuery(PaginationSchema), async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const { offset, limit: actualLimit } = createPaginationQuery(page, limit, 100);

    // Get count
    const { count } = await supabase
      .from('followed_anime')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', req.user.id);

    // Get paginated data
    const { data, error } = await supabase
      .from('followed_anime')
      .select('*')
      .eq('user_id', req.user.id)
      .order('updated_at', { ascending: false })
      .range(offset, offset + actualLimit - 1);

    if (error) throw error;
    return res.status(200).json(paginatedResponse(data || [], count || 0, page, actualLimit));
  } catch (err) {
    return apiError(res, 'Failed to fetch followed list', 500, err);
  }
});

/**
 * @swagger
 * /api/users/me/follow:
 *   post:
 *     summary: Add an anime to the user's library
 *     tags: [Library]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [malId]
 *             properties:
 *               malId: { type: integer }
 *               status: { type: string, enum: [plan, watching, completed, dropped] }
 *     responses:
 *       201:
 *         description: Anime added to library
 */
router.post('/me/follow', async (req, res) => {
  try {
    let { malId, title, isAiring, totalEpisodes, status, nextEpisode } = req.body;
    if (!malId) return apiError(res, 'malId is required', 400);

    if (!title) {
      try {
        const data = await jikanClient.get(`${JIKAN}/anime/${malId}`);
        const anime = data?.data;
        let engTitle = anime?.title_english;
        if (!engTitle && Array.isArray(anime?.titles)) {
          const eng = anime.titles.find(t => t.type === 'English');
          if (eng) engTitle = eng.title;
        }
        title = engTitle || anime?.title || `Anime #${malId}`;
        isAiring = anime?.airing ?? isAiring ?? false;
        totalEpisodes = anime?.episodes ?? totalEpisodes ?? 0;
      } catch {
        title = `Anime #${malId}`;
      }
    }

    const xss = require('xss');
    title = clampText(xss(title), 255);

    const parsedMalId = Number.parseInt(malId, 10);
    const normalizedStatus = ['plan', 'watching', 'completed', 'dropped'].includes(String(status || '').toLowerCase())
      ? String(status).toLowerCase()
      : 'plan';
    const parsedNextEpisode = Math.max(0, Number.parseInt(nextEpisode, 10) || 0);

    const clientId = clampText(req.body?.clientId, 80);
    const mutationId = clampText(req.body?.mutationId, 120);
    const watchlistAddedAt = isoFromMs(req.body?.watchlistAddedAt);
    const watchProgressAt = isoFromMs(req.body?.watchProgressAt);
    const completedAt = isoFromMs(req.body?.completedAt);
    const ratingUpdatedAt = isoFromMs(req.body?.ratingUpdatedAt);
    const userRatingRaw = Number(req.body?.userRating);
    const userRating = Number.isFinite(userRatingRaw) && userRatingRaw > 0 ? Math.min(10, Math.max(1, userRatingRaw)) : null;

    const nowIso = new Date().toISOString();
    const resolvedWatchlistAddedAt = watchlistAddedAt || (normalizedStatus === 'plan' ? nowIso : null);
    const resolvedWatchProgressAt = watchProgressAt || (parsedNextEpisode > 0 ? nowIso : null);
    const resolvedCompletedAt = completedAt || (normalizedStatus === 'completed' ? nowIso : null);
    const resolvedRatingUpdatedAt = ratingUpdatedAt || (userRating ? nowIso : null);

    const { data, error } = await supabase
      .from('followed_anime')
      .upsert({
        user_id: req.user.id,
        mal_id: parsedMalId,
        title,
        image: req.body?.image || '',
        status: normalizedStatus,
        next_episode: parsedNextEpisode,
        is_airing: Boolean(isAiring),
        total_episodes: Number.parseInt(totalEpisodes, 10) || 0,
        user_rating: userRating,
        updated_at: nowIso,
        watchlist_added_at: resolvedWatchlistAddedAt,
        watch_progress_at: resolvedWatchProgressAt,
        completed_at: resolvedCompletedAt,
        rating_updated_at: resolvedRatingUpdatedAt,
        client_id: clientId || null,
        mutation_id: mutationId || null
      }, { onConflict: 'user_id, mal_id' })
      .select();

    if (error) throw error;

    // Trigger Social Presence if status is active
    if (normalizedStatus === 'watching' || normalizedStatus === 'completed') {
      try {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('id, name, avatar')
          .eq('user_id', req.user.id)
          .maybeSingle();

        if (profile) {
          const actionText = normalizedStatus === 'watching' ? 'is watching' : 'completed';
          const payloadString = JSON.stringify({ 
            title, 
            malId: parsedMalId,
            image: req.body?.image || '' 
          });
          
          recordActivity(profile, actionText, payloadString);
        }
      } catch (err) {
        console.error('Failed to trigger presence activity:', err.message);
      }
    }

    return apiResponse(res, data?.[0] || null, 201, `Now following "${title}"`);
  } catch (err) {
    return apiError(res, 'Failed to follow anime', 500, err);
  }
});

router.post('/me/follow/batch', async (req, res) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) return apiResponse(res, [], 200, 'No items');

    const nowIso = new Date().toISOString();
    const rows = items
      .map((item) => {
        const malId = Number.parseInt(item?.malId, 10);
        if (!malId) return null;
        const normalizedStatus = ['plan', 'watching', 'completed', 'dropped'].includes(String(item?.status || '').toLowerCase())
          ? String(item.status).toLowerCase()
          : 'plan';
        const parsedNextEpisode = Math.max(0, Number.parseInt(item?.nextEpisode, 10) || 0);
        const userRatingRaw = Number(item?.userRating);
        const userRating = Number.isFinite(userRatingRaw) && userRatingRaw > 0 ? Math.min(10, Math.max(1, userRatingRaw)) : null;

        const watchlistAddedAt = isoFromMs(item?.watchlistAddedAt);
        const watchProgressAt = isoFromMs(item?.watchProgressAt);
        const completedAt = isoFromMs(item?.completedAt);
        const ratingUpdatedAt = isoFromMs(item?.ratingUpdatedAt);

        const resolvedWatchlistAddedAt = watchlistAddedAt || (normalizedStatus === 'plan' ? nowIso : null);
        const resolvedWatchProgressAt = watchProgressAt || (parsedNextEpisode > 0 ? nowIso : null);
        const resolvedCompletedAt = completedAt || (normalizedStatus === 'completed' ? nowIso : null);
        const resolvedRatingUpdatedAt = ratingUpdatedAt || (userRating ? nowIso : null);

        return {
          user_id: req.user.id,
          mal_id: malId,
          title: clampText(item?.title, 255),
          image: clampText(item?.image, 2048),
          status: normalizedStatus,
          next_episode: parsedNextEpisode,
          is_airing: Boolean(item?.isAiring),
          total_episodes: Number.parseInt(item?.totalEpisodes, 10) || 0,
          user_rating: userRating,
          updated_at: nowIso,
          watchlist_added_at: resolvedWatchlistAddedAt,
          watch_progress_at: resolvedWatchProgressAt,
          completed_at: resolvedCompletedAt,
          rating_updated_at: resolvedRatingUpdatedAt,
          client_id: clampText(item?.clientId, 80) || null,
          mutation_id: clampText(item?.mutationId, 120) || null
        };
      })
      .filter(Boolean);

    const { data, error } = await supabase
      .from('followed_anime')
      .upsert(rows, { onConflict: 'user_id, mal_id' })
      .select();

    if (error) throw error;
    return apiResponse(res, data || [], 200, 'Batch synced');
  } catch (err) {
    return apiError(res, 'Failed to batch follow', 500, err);
  }
});

router.post('/me/unfollow/batch', async (req, res) => {
  try {
    const malIds = (Array.isArray(req.body?.malIds) ? req.body.malIds : [])
      .map((id) => Number.parseInt(id, 10))
      .filter((id) => Number.isFinite(id) && id > 0);

    if (!malIds.length) return apiResponse(res, { removed: 0 }, 200, 'No items');

    const { error, count } = await supabase
      .from('followed_anime')
      .delete({ count: 'exact' })
      .eq('user_id', req.user.id)
      .in('mal_id', malIds);

    if (error) throw error;
    return apiResponse(res, { removed: count || 0 }, 200, 'Batch unfollowed');
  } catch (err) {
    return apiError(res, 'Failed to batch unfollow', 500, err);
  }
});

/**
 * @swagger
 * /api/users/me/unfollow/{malId}:
 *   delete:
 *     summary: Remove an anime from the user's library
 *     tags: [Library]
 *     parameters:
 *       - in: path
 *         name: malId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Unfollowed successfully
 *       404:
 *         description: Entry not found
 */
router.delete('/me/unfollow/:malId', async (req, res) => {
  try {
    const parsedMalId = Number.parseInt(req.params.malId, 10);
    const { error, count } = await supabase
      .from('followed_anime')
      .delete({ count: 'exact' })
      .match({ user_id: req.user.id, mal_id: parsedMalId });

    if (error) throw error;
    if (!count) return apiError(res, 'Entry not found', 404);
    return apiResponse(res, null, 200, 'Unfollowed');
  } catch (err) {
    return apiError(res, 'Failed to unfollow', 500, err);
  }
});

/**
 * @swagger
 * /api/users/me/following/{malId}:
 *   get:
 *     summary: Check whether the user follows a specific anime
 *     tags: [Library]
 *     parameters:
 *       - in: path
 *         name: malId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: '{ following: boolean }'
 */
router.get('/me/following/:malId', async (req, res) => {
  try {
    const parsedMalId = Number.parseInt(req.params.malId, 10);
    const { data, error } = await supabase
      .from('followed_anime')
      .select('id')
      .match({ user_id: req.user.id, mal_id: parsedMalId })
      .maybeSingle();

    if (error) throw error;
    return apiResponse(res, { following: Boolean(data?.id) }, 200);
  } catch (err) {
    return apiError(res, 'Check failed', 500, err);
  }
});

/**
 * @swagger
 * /api/users/me/profile:
 *   get:
 *     summary: Get the current user's profile
 *     tags: [User]
 *     responses:
 *       200:
 *         description: Profile object
 */
router.get('/me/profile', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (error) throw error;
    return apiResponse(res, data || {}, 200);
  } catch (err) {
    return apiError(res, 'Failed to fetch profile', 500, err);
  }
});

/**
 * @swagger
 * /api/users/me:
 *   delete:
 *     summary: Permanently delete the current user's account and all Animyx data
 *     tags: [User]
 *     responses:
 *       200:
 *         description: Account deleted
 */
router.delete('/me', async (req, res) => {
  try {
    const userId = req.user.id;

    // Best-effort deletes (most tables also have FK ON DELETE CASCADE from auth.users).
    await Promise.allSettled([
      supabase.from('followed_anime').delete().eq('user_id', userId),
      supabase.from('user_profiles').delete().eq('user_id', userId),
      supabase.from('user_settings').delete().eq('user_id', userId),
      supabase.from('notifications').delete().eq('user_id', userId),
      supabase.from('push_subscriptions').delete().eq('user_id', userId),
      supabase.from('anime_follows').delete().eq('user_id', userId)
    ]);

    // Delete the auth user (requires service role key).
    const admin = supabase?.auth?.admin;
    if (admin?.deleteUser) {
      const { error } = await admin.deleteUser(userId);
      if (error) throw error;
    }

    return apiResponse(res, { deleted: true }, 200, 'Account deleted');
  } catch (err) {
    return apiError(res, 'Failed to delete account', 500, err);
  }
});

const profileValidator = validate({
  body: {
    name: { type: 'string', maxLength: 80 },
    bio: { type: 'string', maxLength: 500 },
    avatar: { type: 'string', maxLength: 1048576 }, // 1MB for base64
    banner: { type: 'string', maxLength: 1048576 }, // 1MB for base64
    mal: { type: 'string', maxLength: 255 },
    al: { type: 'string', maxLength: 255 },
  },
});

/**
 * @swagger
 * /api/users/me/profile:
 *   put:
 *     summary: Update the current user's profile
 *     tags: [User]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:   { type: string, maxLength: 80 }
 *               bio:    { type: string, maxLength: 500 }
 *               avatar: { type: string, maxLength: 2048 }
 *               banner: { type: string, maxLength: 2048 }
 *               mal:    { type: string, maxLength: 255 }
 *               al:     { type: string, maxLength: 255 }
 *     responses:
 *       200:
 *         description: Updated profile
 *       400:
 *         description: Validation error
 */
router.put('/me/profile', profileValidator, async (req, res) => {
  try {
    const name = clampText(req.body?.name, 80);
    const bio = clampText(req.body?.bio, 500);
    const avatar = clampText(req.body?.avatar, 2048);
    const banner = clampText(req.body?.banner, 2048);
    const mal = clampText(req.body?.mal, 255);
    const al = clampText(req.body?.al, 255);
    const { data, error } = await supabase
      .from('user_profiles')
      .upsert({
        user_id: req.user.id,
        name,
        bio,
        avatar,
        banner,
        mal,
        al,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' })
      .select();

    if (error) throw error;
    return apiResponse(res, data?.[0] || {}, 200, 'Profile synced');
  } catch (err) {
    return apiError(res, 'Failed to update profile', 500, err);
  }
});

/**
 * @swagger
 * /api/users/me/settings:
 *   get:
 *     summary: Get the current user's settings
 *     tags: [User]
 *     responses:
 *       200:
 *         description: Settings object
 */
router.get('/me/settings', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (error) throw error;
    return apiResponse(res, data || {}, 200);
  } catch (err) {
    return apiError(res, 'Failed to fetch settings', 500, err);
  }
});

const settingsValidator = validate({
  body: {
    title_lang: { type: 'string', enum: ['english', 'romaji', 'japanese'] },
    default_status: { type: 'string', enum: ['plan', 'watching', 'completed', 'dropped'] },
    accent_color: { type: 'string', maxLength: 24 },
  },
});

/**
 * @swagger
 * /api/users/me/settings:
 *   put:
 *     summary: Update the current user's settings
 *     tags: [User]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               dark_theme:     { type: boolean }
 *               notifications:  { type: boolean }
 *               autoplay:       { type: boolean }
 *               data_saver:     { type: boolean }
 *               title_lang:     { type: string, enum: [english, romaji, japanese] }
 *               default_status: { type: string, enum: [plan, watching, completed, dropped] }
 *               accent_color:   { type: string }
 *     responses:
 *       200:
 *         description: Updated settings
 *       400:
 *         description: Validation error
 */
router.put('/me/settings', settingsValidator, async (req, res) => {
  try {
    const dark_theme = Boolean(req.body?.dark_theme);
    const notifications = Boolean(req.body?.notifications);
    const autoplay = Boolean(req.body?.autoplay);
    const data_saver = Boolean(req.body?.data_saver);
    const title_lang = ['english', 'romaji', 'japanese'].includes(String(req.body?.title_lang || '').toLowerCase())
      ? String(req.body.title_lang).toLowerCase()
      : 'english';
    const default_status = ['plan', 'watching', 'completed', 'dropped'].includes(String(req.body?.default_status || '').toLowerCase())
      ? String(req.body.default_status).toLowerCase()
      : 'plan';
    // Only allow valid CSS hex colors (#RGB, #RRGGBB, #RRGGBBAA)
    const rawAccent = String(req.body?.accent_color || '').trim();
    const accent_color = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{4}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(rawAccent)
      ? rawAccent
      : '';

    const { data, error } = await supabase
      .from('user_settings')
      .upsert({
        user_id: req.user.id,
        dark_theme,
        notifications,
        autoplay,
        data_saver,
        title_lang,
        default_status,
        accent_color,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' })
      .select();

    if (error) throw error;
    return apiResponse(res, data?.[0] || {}, 200, 'Settings synced');
  } catch (err) {
    return apiError(res, 'Failed to update settings', 500, err);
  }
});

/**
 * @swagger
 * /api/users/me/recommendations:
 *   get:
 *     summary: Get personalized anime recommendations for the current user (paginated)
 *     tags: [User]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 50, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated array of personalized recommendation objects
 *       400:
 *         description: Invalid pagination parameters
 */
router.get('/me/recommendations', validateQuery(PaginationSchema), async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const { offset, limit: actualLimit } = createPaginationQuery(page, limit, 50);

    const { data, error } = await supabase
      .from('user_recommendations')
      .select('recommendations, updated_at')
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (error) throw error;

    const recs = Array.isArray(data?.recommendations) ? data.recommendations : [];
    const paginatedRecs = recs.slice(offset, offset + actualLimit);
    return res.status(200).json(paginatedResponse(paginatedRecs, recs.length, page, actualLimit));
  } catch (err) {
    return apiError(res, 'Failed to fetch recommendations', 500, err);
  }
});

/**
 * @swagger
 * /api/users/community/activity:
 *   get:
 *     summary: Get recent global community activities (paginated)
 *     tags: [Community]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 50 }
 *     responses:
 *       200:
 *         description: Paginated array of recent activities
 *       400:
 *         description: Invalid pagination parameters
 */
router.get('/community/activity', validateQuery(PaginationSchema), async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const { offset, limit: actualLimit } = createPaginationQuery(page, limit, 100);

    const activities = await getRecentActivities();
    const paginatedActivities = activities.slice(offset, offset + actualLimit);
    return res.status(200).json(paginatedResponse(paginatedActivities, activities.length, page, actualLimit));
  } catch (err) {
    return apiError(res, 'Failed to fetch community activity', 500, err);
  }
});

module.exports = router;
