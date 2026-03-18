/**
 * Animyx — Nightly Recommendation Engine
 *
 * Runs at 3 AM daily. For each recently active user, derives their
 * top genre preferences from their completed/rated library entries,
 * fetches matching top-rated anime from Jikan, excludes titles already
 * in their library, and stores the personalized list in Supabase.
 */
const axios = require('axios');
const { jikanClient } = require('../utils');
const supabase = require('../database/supabase');
const { acquireLock, releaseLock } = require('./lock.js');
const { logger } = require('../utils');

const JIKAN = process.env.JIKAN_API_URL || 'https://api.jikan.moe/v4';

// Jikan genre IDs for common anime genres (used for API filtering)
const GENRE_NAME_TO_ID = {
    'Action': 1,
    'Adventure': 2,
    'Comedy': 4,
    'Drama': 8,
    'Fantasy': 10,
    'Horror': 14,
    'Mystery': 7,
    'Romance': 22,
    'Sci-Fi': 24,
    'Sports': 30,
    'Supernatural': 37,
    'Thriller': 41,
    'Slice of Life': 36,
    'Mecha': 18,
    'Music': 19,
    'Psychological': 40
};

const JIKAN_REQUEST_DELAY_MS = 500; // Respect Jikan rate-limit (3 req/s)
const USER_PAGE_SIZE = 100;

// ─────────────────────────────────────────
//  Helper: sleep
// ─────────────────────────────────────────
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────
//  Derive top genre IDs from library entries
// ─────────────────────────────────────────
function extractTopGenreIds(libraryEntries, limit = 3) {
    const counts = new Map();
    for (const entry of libraryEntries) {
        const genres = Array.isArray(entry.genres) ? entry.genres : [];
        for (const genre of genres) {
            const key = String(genre || '').trim();
            if (key) counts.set(key, (counts.get(key) || 0) + 1);
        }
    }
    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([name]) => GENRE_NAME_TO_ID[name])
        .filter(Boolean);
}

// ─────────────────────────────────────────
//  Fetch top-rated anime in given genre IDs from Jikan
// ─────────────────────────────────────────
async function fetchJikanByGenres(genreIds) {
    if (!genreIds.length) return [];
    try {
        const data = await jikanClient.get(`${JIKAN}/anime`, {
            params: {
                genres: genreIds.join(','),
                order_by: 'score',
                sort: 'desc',
                limit: 15,
                sfw: true
            },
            timeout: 10000
        });
        return Array.isArray(data?.data) ? data.data : [];
    } catch (err) {
        logger.error(err, { context: 'recommendations.job fetchJikanByGenres', genreIds });
        return [];
    }
}

// ─────────────────────────────────────────
//  Build recommendations for a single user
// ─────────────────────────────────────────
async function buildForUser(userId) {
    // 1. Fetch user's library (completed + watching + plan)
    const { data: library, error: libErr } = await supabase
        .from('followed_anime')
        .select('mal_id, status, genres')
        .eq('user_id', userId);

    if (libErr) {
        logger.error(libErr, { context: 'recommendations.job buildForUser fetch library', userId });
        return;
    }

    if (!library || !library.length) return; // Nothing to base recommendations on

    const existingMalIds = new Set(library.map(e => Number(e.mal_id)));

    // 2. Focus on completed / high status for genre derivation
    const qualityEntries = library.filter(e =>
        e.status === 'completed' || e.status === 'watching'
    );
    const entriesForGenre = qualityEntries.length ? qualityEntries : library;

    // 3. Derive top genre IDs
    const genreIds = extractTopGenreIds(entriesForGenre, 3);

    // 4. Fetch recommendations from Jikan (or return generic top if no genres)
    let candidates = genreIds.length
        ? await fetchJikanByGenres(genreIds)
        : [];

    // Fallback: fetch generic top anime
    if (!candidates.length) {
        try {
            const data = await jikanClient.get(`${JIKAN}/top/anime`, {
                params: { limit: 15 },
                timeout: 10000
            });
            candidates = Array.isArray(data?.data) ? data.data : [];
        } catch { candidates = []; }
    }

    // 5. Filter out anime already in library
    const recs = candidates
        .filter(anime => !existingMalIds.has(Number(anime?.mal_id)))
        .slice(0, 10)
        .map(anime => ({
            malId: Number(anime.mal_id),
            title: anime.title_english || anime.title || `Anime #${anime.mal_id}`,
            image: anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || '',
            score: anime.score || null,
            genres: (anime.genres || []).map(g => g.name).filter(Boolean),
            type: anime.type || '',
            year: anime.year || null
        }));

    if (!recs.length) return;

    // 6. Upsert to user_recommendations
    const { error: upsertErr } = await supabase
        .from('user_recommendations')
        .upsert(
            { user_id: userId, recommendations: recs, updated_at: new Date().toISOString() },
            { onConflict: 'user_id' }
        );

    if (upsertErr) {
        logger.error(upsertErr, { context: 'recommendations.job upsert', userId });
    }
}

// ─────────────────────────────────────────
//  Main entry: build recs for all active users
// ─────────────────────────────────────────
async function buildRecommendations() {
    const lockAcquired = await acquireLock('build_recommendations', 10);
    if (!lockAcquired) {
        logger.info('[Recommendations] Job skipped — lock already active.');
        return;
    }

    try {
        logger.info('[Recommendations] Starting nightly recommendation build...');

        let page = 0;
        let processedUsers = 0;

        while (true) {
            // Get distinct user IDs from followed_anime (active users have entries)
            const { data: rows, error } = await supabase
                .from('followed_anime')
                .select('user_id')
                .range(page * USER_PAGE_SIZE, (page + 1) * USER_PAGE_SIZE - 1);

            if (error) {
                logger.error(error, { context: 'recommendations.job fetch users' });
                break;
            }
            if (!rows || rows.length === 0) break;

            // Deduplicate user IDs in this page
            const userIds = [...new Set(rows.map(r => r.user_id).filter(Boolean))];

            for (const userId of userIds) {
                await buildForUser(userId);
                await sleep(JIKAN_REQUEST_DELAY_MS);
                processedUsers++;
            }

            page++;
        }

        logger.info(`[Recommendations] Completed. Processed ${processedUsers} users.`);
    } finally {
        await releaseLock('build_recommendations');
    }
}

module.exports = { buildRecommendations: require('./jobs.js').buildRecommendations };
