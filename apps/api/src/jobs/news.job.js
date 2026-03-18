const Parser = require('rss-parser');
const supabase = require('../database/supabase.js');
const { acquireLock, releaseLock } = require('./lock.js');

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

module.exports = {
  scanAnimeNews: require('./jobs.js').scanAnimeNews
};
