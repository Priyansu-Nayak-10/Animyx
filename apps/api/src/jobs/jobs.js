/**
 * Animyx backend jobs — consolidated module.
 *
 * This file merges the logic that previously lived in:
 * - jobs/lifecycle.job.js
 * - jobs/news.job.js
 * - jobs/recommendations.job.js
 * - jobs/lock.js
 *
 * Keep it CommonJS to match the backend runtime.
 */

const cron = require('node-cron');
const Parser = require('rss-parser');
const axios = require('axios');

const supabase = require('../database/supabase.js');
const { jikanClient, logger, checkAnime } = require('../utils');

// ---------------------------------------------------------------------------
// Distributed job locks (Supabase RPC)
// ---------------------------------------------------------------------------

async function acquireLock(jobName, lockDurationMinutes = 10) {
  const { data, error } = await supabase.rpc('acquire_job_lock', {
    p_job_name: jobName,
    p_lock_seconds: Math.max(60, Math.floor(lockDurationMinutes * 60))
  });
  return !error && data === true;
}

async function releaseLock(jobName) {
  await supabase.rpc('release_job_lock', { p_job_name: jobName });
}

// ---------------------------------------------------------------------------
// News scan job (RSS -> anime_events fanout)
// ---------------------------------------------------------------------------

const parser = new Parser();
const FEEDS = [
  'https://www.animenewsnetwork.com/all/rss.xml',
  'https://myanimelist.net/rss/news.xml',
  'https://www.crunchyroll.com/newsrss'
];

function normalizeTitle(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractMalId(article) {
  const chunks = [article?.link, article?.guid, article?.id, article?.title]
    .filter(Boolean)
    .join(' ');
  const match = chunks.match(/myanimelist\.net\/anime\/(\d+)/i);
  return match ? Number(match[1]) : 0;
}

async function loadFollowedAnimeIndex() {
  const { data: follows, error: followError } = await supabase
    .from('anime_follows')
    .select('mal_id');
  if (followError) throw followError;

  const malIds = [...new Set((follows || []).map((row) => Number(row?.mal_id)).filter(Boolean))];
  if (!malIds.length) return [];

  const { data: titledRows, error: titleError } = await supabase
    .from('followed_anime')
    .select('mal_id, title')
    .in('mal_id', malIds);
  if (titleError) throw titleError;

  const titleMap = new Map(
    (titledRows || [])
      .map((row) => [Number(row?.mal_id), normalizeTitle(row?.title)])
      .filter(([id, title]) => id && title)
  );

  return malIds.map((malId) => ({
    malId,
    title: titleMap.get(malId) || ''
  }));
}

function matchArticleToAnime(article, animeIndex) {
  const text = normalizeTitle(
    `${article?.title || ''} ${article?.contentSnippet || ''} ${article?.content || ''}`
  );

  const malIdFromArticle = extractMalId(article);
  if (malIdFromArticle) {
    const matchedById = animeIndex.find((item) => item.malId === malIdFromArticle);
    if (matchedById) return matchedById.malId;
  }

  for (const anime of animeIndex) {
    if (!anime.title || anime.title.length < 3) continue;
    if (text.includes(anime.title)) return anime.malId;
  }

  return 0;
}

async function createNewsEvent(malId, headline, sourceUrl) {
  const payload = {
    type: 'NEWS',
    mal_id: Number(malId),
    message: String(headline || '').trim(),
    source_url: sourceUrl || null
  };
  if (!payload.mal_id || !payload.message) return false;

  const { data: inserted, error } = await supabase
    .from('anime_events')
    .upsert(payload, { onConflict: 'type,mal_id,message' })
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('[News Job] Failed to persist anime_events row:', error.message || error);
    return false;
  }

  if (!inserted?.id) return false;

  const { data: pushed, error: eventError } = await supabase.rpc('process_anime_event', {
    p_type: 'NEWS',
    p_mal_id: Number(malId),
    p_message: payload.message
  });

  if (eventError) {
    console.error('[News Job] Failed to fan out notifications:', eventError.message || eventError);
    return false;
  }

  return pushed === true;
}

async function processArticle(article, animeIndex) {
  const malId = matchArticleToAnime(article, animeIndex);
  if (!malId) return false;
  return createNewsEvent(malId, article?.title || 'Anime news update', article?.link || null);
}

async function scanAnimeNews() {
  const locked = await acquireLock('scan_anime_news', 55);
  if (!locked) {
    console.log('[News Job] Skipped. Existing run still holds lock.');
    return;
  }

  try {
    const animeIndex = await loadFollowedAnimeIndex();
    if (!animeIndex.length) {
      console.log('[News Job] No followed anime found. Skipping scan.');
      return;
    }

    let processed = 0;
    let matched = 0;
    for (const feed of FEEDS) {
      try {
        const rss = await parser.parseURL(feed);
        const items = Array.isArray(rss?.items) ? rss.items : [];
        for (const article of items) {
          processed += 1;
          const isNew = await processArticle(article, animeIndex);
          if (isNew) matched += 1;
        }
      } catch (error) {
        console.warn(`[News Job] Feed failed (${feed}):`, error.message || error);
      }
    }

    console.log(`[News Job] Completed. Processed ${processed} articles, created ${matched} event(s).`);
  } finally {
    await releaseLock('scan_anime_news');
  }
}

// ---------------------------------------------------------------------------
// Nightly recommendation engine
// ---------------------------------------------------------------------------

const JIKAN = process.env.JIKAN_API_URL || 'https://api.jikan.moe/v4';

const GENRE_NAME_TO_ID = {
  Action: 1,
  Adventure: 2,
  Comedy: 4,
  Drama: 8,
  Fantasy: 10,
  Horror: 14,
  Mystery: 7,
  Romance: 22,
  'Sci-Fi': 24,
  Sports: 30,
  Supernatural: 37,
  Thriller: 41,
  'Slice of Life': 36,
  Mecha: 18,
  Music: 19,
  Psychological: 40
};

const JIKAN_REQUEST_DELAY_MS = 500; // Respect Jikan rate-limit (3 req/s)
const USER_PAGE_SIZE = 100;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

async function buildForUser(userId) {
  const { data: library, error: libErr } = await supabase
    .from('followed_anime')
    .select('mal_id, status, genres')
    .eq('user_id', userId);

  if (libErr) {
    logger.error(libErr, { context: 'recommendations.job buildForUser fetch library', userId });
    return;
  }

  if (!library || !library.length) return;

  const existingMalIds = new Set(library.map((entry) => Number(entry.mal_id)));

  const qualityEntries = library.filter(
    (entry) => entry.status === 'completed' || entry.status === 'watching'
  );
  const entriesForGenre = qualityEntries.length ? qualityEntries : library;

  const genreIds = extractTopGenreIds(entriesForGenre, 3);

  let candidates = genreIds.length
    ? await fetchJikanByGenres(genreIds)
    : [];

  if (!candidates.length) {
    try {
      const data = await jikanClient.get(`${JIKAN}/top/anime`, {
        params: { limit: 15 },
        timeout: 10000
      });
      candidates = Array.isArray(data?.data) ? data.data : [];
    } catch {
      candidates = [];
    }
  }

  const recs = candidates
    .filter((anime) => !existingMalIds.has(Number(anime?.mal_id)))
    .slice(0, 10)
    .map((anime) => ({
      malId: Number(anime.mal_id),
      title: anime.title_english || anime.title || `Anime #${anime.mal_id}`,
      image: anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || '',
      score: anime.score || null,
      genres: (anime.genres || []).map((genre) => genre.name).filter(Boolean),
      type: anime.type || '',
      year: anime.year || null
    }));

  if (!recs.length) return;

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
      const { data: rows, error } = await supabase
        .from('followed_anime')
        .select('user_id')
        .range(page * USER_PAGE_SIZE, (page + 1) * USER_PAGE_SIZE - 1);

      if (error) {
        logger.error(error, { context: 'recommendations.job fetch users' });
        break;
      }
      if (!rows || rows.length === 0) break;

      const userIds = [...new Set(rows.map((row) => row.user_id).filter(Boolean))];

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

// ---------------------------------------------------------------------------
// Lifecycle + scheduler
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50;

async function scanActiveAnime() {
  const lockAcquired = await acquireLock('scan_active_anime', 5);
  if (!lockAcquired) {
    console.log('[Cron] Job skipped. Lock is active or overlapping.');
    return;
  }

  try {
    console.log('[Cron] Starting active anime scan...');
    let page = 0;
    while (true) {
      const { data: follows, error } = await supabase
        .from('anime_follows')
        .select('mal_id')
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (error) throw error;
      if (!follows || follows.length === 0) break;

      for (const anime of follows) {
        await checkAnime(anime);
        await new Promise((resolve) => setTimeout(resolve, 350));
      }

      page++;
    }
  } finally {
    await releaseLock('scan_active_anime');
    console.log('[Cron] Finished active anime scan.');
  }
}

function initScheduler() {
  cron.schedule('*/30 * * * *', scanActiveAnime);
  cron.schedule('0 * * * *', () => {
    void scanAnimeNews();
  });
  cron.schedule('0 3 * * *', () => {
    void buildRecommendations();
  });
  console.log('[Scheduler] Cron initialized (lifecycle: every 30m, news: hourly, recommendations: nightly 3AM).');
}

module.exports = {
  acquireLock,
  releaseLock,
  scanAnimeNews,
  buildRecommendations,
  scanActiveAnime,
  initScheduler
};

