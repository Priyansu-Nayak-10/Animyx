/**
 * Animyx backend utils — consolidated module.
 *
 * This file intentionally exports the same public utilities that previously lived in:
 * - utils/logger.js
 * - utils/httpClient.js
 * - utils/fetcher.js
 * - utils/helpers.js
 *
 * Keep it CommonJS to match the backend runtime.
 */

const axios = require('axios');
const { DateTime } = require('luxon');

const getSupabase = () => require('../database/supabase.js');

// ---------------------------------------------------------------------------
// Logger (Structured with error tracking support)
// ---------------------------------------------------------------------------

function formatLogPayload(level, context, args) {
  const timestamp = new Date().toISOString();
  const [first, ...rest] = args;
  
  let message = "";
  let error = null;

  if (first instanceof Error) {
    message = first.message;
    error = first;
  } else if (typeof first === 'object' && first !== null) {
    message = JSON.stringify(first);
    error = first; // Still treat as error for stack/code extraction
  } else {
    message = String(first);
  }

  const meta = rest.length ? rest[0] : {};

  const entry = {
    level,
    timestamp,
    context,
    message,
    ...(error && { 
      stack: error.stack || undefined, 
      errorCode: error.code || error.errorCode || undefined 
    }),
    ...meta
  };

  return JSON.stringify(entry);
}

/**
 * Create a contextualized logger for a module/component
 * @param {string} context - Module/component name for logging context
 * @returns {Object} Logger instance with info, warn, error, debug methods
 */
function createLogger(context = 'app') {
  return {
    info: (msg, meta) => {
      console.log(formatLogPayload('info', context, [msg, meta]));
      sendToErrorTracker(context, 'info', msg, meta);
    },
    warn: (msg, meta) => {
      console.warn(formatLogPayload('warn', context, [msg, meta]));
      sendToErrorTracker(context, 'warn', msg, meta);
    },
    error: (msg, error, meta = {}) => {
      // Handle shifting arguments: logger.error(errorObj)
      let actualMsg = msg;
      let actualError = error;
      let actualMeta = meta;

      if (msg instanceof Error || (typeof msg === 'object' && msg !== null && !error)) {
        actualError = msg;
        actualMsg = "An error occurred";
      }

      const errorObj = actualError instanceof Error ? actualError : (typeof actualError === 'object' ? actualError : new Error(String(actualError)));
      console.error(formatLogPayload('error', context, [errorObj, { ...actualMeta, msg: actualMsg }]));
      sendToErrorTracker(context, 'error', actualMsg, { ...actualMeta, error: errorObj });
    },
    debug: (msg, meta) => {
      if (process.env.DEBUG) {
        console.debug(formatLogPayload('debug', context, [msg, meta]));
      }
    }
  };
}

/**
 * Send errors to external error tracking service (Sentry, etc)
 * Can be extended to integrate with Sentry or similar
 */
function sendToErrorTracker(context, level, message, data) {
  if (process.env.SENTRY_DSN && level === 'error') {
    // Placeholder for Sentry integration
    // In production, this would be: Sentry.captureException(new Error(message), { extra: data });
  }
}

// Default context logger for backward compatibility
const logger = createLogger('app');

// ---------------------------------------------------------------------------
// HTTP clients (Jikan + AniList) with retry + dedup
// ---------------------------------------------------------------------------

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithRetry(clientFn, url, options = {}, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await clientFn(url, options);
      return response;
    } catch (error) {
      if (error.response && error.response.status === 429) {
        logger.warn(`Rate limit hit on ${url}, retrying... (Attempt ${attempt}/${retries})`);
        await wait(2000 * attempt);
        continue;
      }
      if (attempt === retries) {
        logger.error(`HTTP request failed: ${url}`, { error: error.message });
        throw error;
      }
      await wait(1000 * attempt);
    }
  }
  return null;
}

const activeJikanRequests = new Map();

const jikanClient = {
  get: async (url, config = {}) => {
    const key = `${url}|${JSON.stringify(config)}`;
    if (activeJikanRequests.has(key)) {
      logger.info(`[Deduplication] Returning active promise for ${url}`);
      return activeJikanRequests.get(key);
    }

    const promise = fetchWithRetry(axios.get, url, config, 3)
      .then((response) => {
        activeJikanRequests.delete(key);
        return response.data;
      })
      .catch((err) => {
        activeJikanRequests.delete(key);
        throw err;
      });

    activeJikanRequests.set(key, promise);
    return promise;
  }
};

const anilistClient = {
  graphql: async (query, variables = {}, config = {}) => {
    const response = await fetchWithRetry(axios.post, 'https://graphql.anilist.co', {
      ...config,
      data: { query, variables }
    }, 3);
    return response.data;
  }
};

// ---------------------------------------------------------------------------
// Fetch helper (node fetch wrapper)
// ---------------------------------------------------------------------------

async function safeFetch(url, options = {}, retries = 2) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        if (response.status === 429) {
          await wait(2000 * attempt);
          continue;
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      if (attempt === retries) throw error;
      await wait(1000 * attempt);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// API helpers + normalization pipeline
// ---------------------------------------------------------------------------

const apiResponse = (res, data, statusCode = 200, message = 'Success') => {
  return res.status(statusCode).json({ success: true, message, data });
};

const apiError = (res, message = 'Internal Server Error', statusCode = 500, error = null) => {
  if (error) {
    logger.error(message, error, { statusCode });
  }

  if (statusCode >= 500) {
    return res.status(statusCode).json({ success: false, error: 'Internal server error' });
  }

  return res.status(statusCode).json({ success: false, error: message });
};

async function getSequelIds(malId) {
  const supabase = getSupabase();
  const parsedMalId = Number(malId);
  if (!parsedMalId) return [];

  const { data: cache } = await supabase
    .from('anime_relations_cache')
    .select('sequel_ids')
    .eq('mal_id', parsedMalId)
    .maybeSingle();

  if (Array.isArray(cache?.sequel_ids)) {
    return cache.sequel_ids.filter(Boolean);
  }

  const json = await jikanClient.get(`https://api.jikan.moe/v4/anime/${parsedMalId}/relations`);
  const relations = Array.isArray(json?.data) ? json.data : [];
  const sequels = relations
    .filter((relation) => String(relation?.relation || '').toLowerCase() === 'sequel')
    .flatMap((relation) => Array.isArray(relation?.entry) ? relation.entry : [])
    .map((entry) => Number(entry?.mal_id))
    .filter(Boolean);

  await supabase
    .from('anime_relations_cache')
    .upsert({
      mal_id: parsedMalId,
      sequel_ids: sequels,
      updated_at: new Date().toISOString()
    }, { onConflict: 'mal_id' });

  return sequels;
}

function detectDub(media) {
  if (!media) return false;
  if (media?.title?.english) return true;

  const dubStreaming = (media.streamingEpisodes || []).some((episode) =>
    String(episode?.title || '').toLowerCase().includes('dub'));
  if (dubStreaming) return true;

  return Boolean((media?.characters?.edges || []).some((edge) =>
    (edge?.voiceActors || []).some((actor) =>
      String(actor?.language || actor?.languageV2 || '').toUpperCase().includes('ENGLISH'))));
}

async function fetchAniListMediaByMalId(malId) {
  const query = `
      query ($idMal: Int) {
        Media(idMal: $idMal, type: ANIME) {
          title { english romaji }
          streamingEpisodes { title }
          characters(sort: ROLE) {
            edges {
              voiceActors(language: ENGLISH, sort: RELEVANCE) {
                languageV2
              }
            }
          }
        }
      }
    `;

  try {
    const json = await anilistClient.graphql(query, { idMal: Number(malId) });
    return json?.data?.Media || null;
  } catch {
    return null;
  }
}

async function createAnimeEvent(type, malId, message) {
  const supabase = getSupabase();
  const payload = {
    type,
    mal_id: Number(malId),
    message
  };

  const { data, error } = await supabase
    .from('anime_events')
    .upsert(payload, { onConflict: 'type,mal_id,message' })
    .select('id')
    .maybeSingle();

  if (error) {
    throw error;
  }

  const { error: fanoutError } = await supabase.rpc('process_anime_event', {
    p_type: type,
    p_mal_id: Number(malId),
    p_message: message
  });

  if (fanoutError) {
    logger.error(fanoutError, { context: 'process_anime_event', type, malId });
  }

  return data?.id || null;
}

async function checkAnime(anime) {
  const malId = Number(anime?.mal_id || anime?.anime_id);
  if (!malId) return;

  try {
    const details = await jikanClient.get(`https://api.jikan.moe/v4/anime/${malId}`);
    const title = details?.data?.title || `Anime #${malId}`;

    if (details?.data?.status === 'Finished Airing') {
      await createAnimeEvent('FINAL_EPISODE', malId, `${title} finished airing`);
    }

    const sequelIds = await getSequelIds(malId);
    for (const sequelId of sequelIds) {
      await createAnimeEvent('SEQUEL', sequelId, `New sequel announced for ${title}`);
    }

    const aniListMedia = await fetchAniListMediaByMalId(malId);
    if (detectDub(aniListMedia)) {
      await createAnimeEvent('DUB_RELEASE', malId, `${title} has an English dub signal`);
    }
  } catch (error) {
    logger.error(error, { context: 'checkAnime', malId });
  }
}

// Airing & schedule helpers

function dayIndex(day) {
  const map = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6
  };
  return map[String(day || '').toLowerCase()] ?? null;
}

function parseJstTime(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})/);
  if (!match) return { hour: 0, minute: 0 };
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function nextAiringTimestamp({ day, time }) {
  const targetDay = dayIndex(day);
  if (targetDay === null) return null;

  const { hour, minute } = parseJstTime(time);
  const tokyoNow = DateTime.now().setZone('Asia/Tokyo');
  const luxonTargetWeekday = targetDay === 0 ? 7 : targetDay;
  let candidate = tokyoNow.set({
    weekday: luxonTargetWeekday,
    hour,
    minute,
    second: 0,
    millisecond: 0
  });

  if (candidate <= tokyoNow) {
    candidate = candidate.plus({ weeks: 1 });
  }

  const utcMillis = candidate.toUTC().toMillis();
  const countdownSeconds = Math.max(0, Math.round((utcMillis - Date.now()) / 1000));

  return {
    timestamp: utcMillis,
    countdownSeconds,
    isoUtc: candidate.toUTC().toISO(),
    isoJst: candidate.toISO()
  };
}

function calculateReleasedEpisodes(anime) {
  if (!anime) return 0;
  if (!anime.airing) return anime.episodes || 0;

  if (anime.aired?.from) {
    const fromDate = DateTime.fromISO(anime.aired.from);
    const now = DateTime.now();

    if (now < fromDate) return 0;

    const diffWeeks = Math.floor(now.diff(fromDate, 'weeks').weeks);
    let released = diffWeeks + 1;

    if (anime.episodes && released > anime.episodes) {
      released = anime.episodes;
    }
    return released;
  }

  return 0;
}

// Data normalization pipeline

function getBestTitle(anime) {
  if (!anime) return "Unknown Title";
  return (
    anime.title_english ||
    anime.title ||
    anime.title_japanese ||
    (anime.title_synonyms && anime.title_synonyms.length > 0 ? anime.title_synonyms[0] : null) ||
    "Unknown Title"
  );
}

function getPoster(anime) {
  if (!anime) return "/assets/no-poster.png";
  return (
    anime.images?.jpg?.large_image_url ||
    anime.images?.jpg?.image_url ||
    anime.images?.webp?.large_image_url ||
    anime.images?.webp?.image_url ||
    "/assets/no-poster.png"
  );
}

function dedupeAnime(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Map();

  for (const anime of list) {
    if (!anime) continue;
    const key = anime.mal_id || getBestTitle(anime);

    if (!seen.has(key)) {
      seen.set(key, anime);
    }
  }

  return Array.from(seen.values());
}

function filterBadEntries(list) {
  if (!Array.isArray(list)) return [];
  return list.filter(a =>
    a && a.mal_id &&
    (a.title || a.title_english || a.title_japanese)
  );
}

function getEpisodeDisplay(anime) {
  if (!anime) return "Ep ?";
  if (anime.airing || anime.status === "Currently Airing") {
    return `Ep ${anime.episodes ?? "?"} (Airing)`;
  }
  return `Ep ${anime.episodes ?? "?"}`;
}

function normalizeAnime(anime) {
  if (!anime) return null;
  const bestTitle = getBestTitle(anime);
  const poster = getPoster(anime);
  const totalEpisodes = anime.episodes || null;
  const releasedEpisodes = calculateReleasedEpisodes(anime);

  const nextAiring = anime.broadcast ? nextAiringTimestamp({
    day: anime.broadcast.day,
    time: anime.broadcast.time
  }) : null;

  return {
    ...anime,
    id: anime.mal_id,
    title: bestTitle,
    title_english: bestTitle,
    poster: poster,
    images: {
      ...anime.images,
      jpg: {
        ...anime.images?.jpg,
        image_url: poster,
        large_image_url: poster
      }
    },
    total_episodes: totalEpisodes,
    released_episodes: releasedEpisodes,
    next_episode: anime.airing ? (releasedEpisodes + 1) : null,
    next_airing: nextAiring,
    airing_status: anime.status || (anime.airing ? 'Currently Airing' : 'Finished Airing'),
    airing_day: anime.broadcast?.day || null,
    display_episodes: getEpisodeDisplay(anime)
  };
}

function processAnimeList(list) {
  if (!Array.isArray(list)) return [];
  const filtered = filterBadEntries(list);
  const deduped = dedupeAnime(filtered);
  return deduped.map(normalizeAnime).filter(Boolean);
}

module.exports = {
  // logger
  logger,
  createLogger,

  // http clients
  jikanClient,
  anilistClient,
  fetchWithRetry,

  // fetcher
  safeFetch,

  // helpers
  apiResponse,
  apiError,
  getSequelIds,
  detectDub,
  checkAnime,
  getBestTitle,
  getPoster,
  dedupeAnime,
  filterBadEntries,
  normalizeAnime,
  processAnimeList,
  nextAiringTimestamp,
  dayIndex,
  calculateReleasedEpisodes,

  // pagination
  ...require('./pagination')
};

