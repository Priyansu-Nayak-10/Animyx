function uniqueByMalId(items = []) {
  const map = new Map();
  items.forEach((item) => {
    const malId = Number(item?.malId || 0);
    if (!malId) return;
    map.set(malId, item);
  });
  return [...map.values()];
}

function listSignature(items = [], projector = (item) => String(item?.malId || 0)) {
  if (!Array.isArray(items) || !items.length) return "0";
  return `${items.length}|${items.map((item) => projector(item)).join(",")}`;
}

function createMemoizedSelector(projectSignature, computeResult) {
  let lastSig = "";
  let lastResult = null;
  return function memoizedSelector(...args) {
    const nextSig = String(projectSignature(...args));
    if (nextSig === lastSig && lastResult !== null) return lastResult;
    lastSig = nextSig;
    lastResult = computeResult(...args);
    return lastResult;
  };
}

function getCombinedDiscoveryState(storeState) {
  return getCombinedDiscoveryStateMemo(storeState);
}

const getCombinedDiscoveryStateMemo = createMemoizedSelector(
  (storeState) => {
    const seasonalSig = listSignature(storeState?.seasonal || []);
    const trendingSig = listSignature(storeState?.trending || []);
    const topSig = listSignature(storeState?.top || []);
    const airingSig = listSignature(storeState?.airing || []);
    return `${seasonalSig}::${trendingSig}::${topSig}::${airingSig}`;
  },
  (storeState) => uniqueByMalId([
    ...(storeState?.seasonal || []),
    ...(storeState?.trending || []),
    ...(storeState?.top || []),
    ...(storeState?.airing || [])
  ])
);

function isCurrentlyAiringStatus(value) {
  const status = String(value || "").toLowerCase();
  return status.includes("airing") && !status.includes("finished");
}

function computeAnikotoRank(anime, trendingIds, libraryById) {
  let score = 0;

  if (isCurrentlyAiringStatus(anime?.status)) score += 50;

  const popularity = Number(anime?.popularity || 0);
  if (popularity > 0) score += 1000 / popularity;

  const malScore = Number(anime?.score || 0);
  if (malScore > 0) score += malScore * 5;

  const malId = Number(anime?.malId || 0);
  const libraryRow = libraryById.get(malId);
  if (libraryRow) score += 40;
  const updatedAt = Number(libraryRow?.updatedAt || 0);
  if (updatedAt > 0 && (Date.now() - updatedAt) <= (7 * 24 * 60 * 60 * 1000)) score += 30;

  if (popularity > 5000) score -= 20;

  if (trendingIds.has(malId)) score += 20;

  return score;
}

function getTopOngoingAnikoto(storeState, limit = 10, libraryItems = []) {
  const airing = Array.isArray(storeState?.airing) ? storeState.airing : [];
  const trending = Array.isArray(storeState?.trending) ? storeState.trending : [];

  const merged = new Map();
  [...airing, ...trending].forEach((anime) => {
    const malId = Number(anime?.malId || 0);
    if (!malId) return;
    if (!merged.has(malId)) merged.set(malId, anime);
  });

  const trendingIds = new Set(trending.map((anime) => Number(anime?.malId || 0)).filter(Boolean));
  const libraryById = new Map(
    (libraryItems || [])
      .map((item) => [Number(item?.malId || 0), item])
      .filter(([malId]) => malId)
  );

  return [...merged.values()]
    .filter((anime) => isCurrentlyAiringStatus(anime?.status))
    .map((anime) => ({
      ...anime,
      __rank: computeAnikotoRank(anime, trendingIds, libraryById)
    }))
    .sort((left, right) => Number(right?.__rank || 0) - Number(left?.__rank || 0))
    .slice(0, Math.max(1, Number(limit || 10)))
    .map(({ __rank, ...anime }) => anime);
}

// Upcoming episodes feature removed: keep no-op selectors for compatibility.
function getLiveUpcoming() {
  return [];
}

function getPredictiveUpcoming() {
  return [];
}

function getUpcomingFeed() {
  return [];
}

function getHybridUpcoming() {
  return [];
}

function getEstimatedUpcomingGrouped() {
  return [];
}

function keepNearestEpisodePerAnime() {
  return [];
}

function getCleanUpcoming() {
  return [];
}

function getUpcomingForCarousel() {
  return [];
}

export {
  uniqueByMalId,
  getCombinedDiscoveryState,
  getLiveUpcoming,
  getPredictiveUpcoming,
  getUpcomingFeed,
  getHybridUpcoming,
  getEstimatedUpcomingGrouped,
  getTopOngoingAnikoto,
  getUpcomingForCarousel,
  keepNearestEpisodePerAnime,
  getCleanUpcoming
} from './appCore.js';
