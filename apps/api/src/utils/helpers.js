/**
 * Common utility helpers for Animyx backend
 */
const { jikanClient, anilistClient } = require('./httpClient.js');
const { DateTime } = require('luxon');
const getSupabase = () => require('../database/supabase.js');

/**
 * Create a standard API response
 */
const apiResponse = (res, data, statusCode = 200, message = 'Success') => {
    return res.status(statusCode).json({ success: true, message, data });
};

/**
 * Create a standard API error response
 */
const apiError = (res, message = 'Internal Server Error', statusCode = 500, error = null) => {

    if (error) {
        const logger = require('./logger');
        logger.error(error, { context: message, statusCode });
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
        const logger = require('./logger');
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
        const logger = require('./logger');
        logger.error(error, { context: 'checkAnime', malId });
    }
}

// ─────────────────────────────────────────
//  Airing & Schedule Helpers
// ─────────────────────────────────────────

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

  // If airing, we try to estimate based on aired.from
  if (anime.aired?.from) {
    const fromDate = DateTime.fromISO(anime.aired.from);
    const now = DateTime.now();
    
    if (now < fromDate) return 0;

    // Difference in weeks
    const diffWeeks = Math.floor(now.diff(fromDate, 'weeks').weeks);
    // Usually 1 episode per week, starting from week 0
    let released = diffWeeks + 1;
    
    // Cap at total episodes if known
    if (anime.episodes && released > anime.episodes) {
        released = anime.episodes;
    }
    return released;
  }

  return 0;
}

// ─────────────────────────────────────────
//  Data Normalization Pipeline
// ─────────────────────────────────────────

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
    // Use MAL ID if available, otherwise fallback to the best title
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
    ...anime, // Preserve original fields for backward compatibility
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
  // 1. Filter out bad entries
  const filtered = filterBadEntries(list);
  // 2. Deduplicate
  const deduped = dedupeAnime(filtered);
  // 3. Normalize
  return deduped.map(normalizeAnime).filter(Boolean);
}

module.exports = require('./index');
