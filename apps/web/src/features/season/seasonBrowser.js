import { initSeasonTabs } from './seasonTabs.js';
import { renderAnimeGrid, resolveAiringStatus, bindHoverPreviews } from './season.js';
import { normalizeAnime, dedupeAnimeList } from '../../core/utils.js';
import { STATUS } from '../../store.js';

export function initSeasonBrowser({ api, toast, libraryStore, modal }) {
    const viewEl = document.getElementById('season-view');
    if (!viewEl) return null;

    const mainNavContainer = document.getElementById('season-main-nav');
    const subNavContainer = document.getElementById('season-sub-nav');
    const gridContainer = document.getElementById('season-anime-grid');

    if (!mainNavContainer || !subNavContainer || !gridContainer) return null;

    let activeRenderRequestId = 0;
    // Local UI dictionary to memorize lists previously visited during the session
    const localMemCache = new Map();

    /** Resolve an anime object from the local cache by malId (string or number). */
    function findAnimeInCache(malId) {
        for (const list of localMemCache.values()) {
            const anime = list.find(a =>
                String(a.malId || a.mal_id || '') === String(malId)
            );
            if (anime) return anime;
        }
        return null;
    }

    async function fetchAndRender(fetchPromise, cacheKey) {
        const requestId = ++activeRenderRequestId;

        if (localMemCache.has(cacheKey)) {
            renderAnimeGrid(gridContainer, localMemCache.get(cacheKey), false);
            return;
        }

        // Show loading skeletons
        renderAnimeGrid(gridContainer, [], true);

        try {
            const payload = await fetchPromise();
            if (requestId !== activeRenderRequestId) return;

            const rawArray = Array.isArray(payload) ? payload : (payload?.data || []);
            const normalized = rawArray.map((item) => {
                const norm = normalizeAnime(item);
                if (!norm.image) {
                    norm.image = 'https://via.placeholder.com/225x320?text=No+Image';
                }
                return norm;
            });
            const animeArray = dedupeAnimeList(normalized);

            localMemCache.set(cacheKey, animeArray);
            renderAnimeGrid(gridContainer, animeArray, false);
        } catch (err) {
            if (requestId !== activeRenderRequestId) return;
            console.error('[SeasonBrowser] Failed to load data:', err);
            if (err.name !== 'AbortError') {
                toast?.show('Failed to fetch seasonal anime', 'error');
                renderAnimeGrid(gridContainer, [], false);
            }
        }
    }

    initSeasonTabs(mainNavContainer, subNavContainer, (tabId, params) => {
        if (tabId === 'upcoming') {
            const fetchFiltered = async () => {
                const payload = await api.getUpcomingAnime(1);
                const array = Array.isArray(payload) ? payload : (payload?.data || []);
                if (!Array.isArray(payload) && payload?.data) {
                    return {
                        ...payload,
                        data: payload.data.filter((a) => resolveAiringStatus(a) === 'upcoming')
                    };
                }
                return array.filter((a) => resolveAiringStatus(a) === 'upcoming');
            }
            fetchAndRender(fetchFiltered, 'upcoming');
        } else if (tabId === 'top') {
            fetchAndRender(() => api.getTop(30), 'top');
        } else if (tabId === 'season_spec') {
            const { year, season } = params;
            const fetchFiltered = async () => {
                const payload = await api.getSeasonalAnime(year, season, 1);
                const array = Array.isArray(payload) ? payload : (payload?.data || []);
                if (!Array.isArray(payload) && payload?.data) {
                    return {
                        ...payload,
                        data: payload.data.filter((a) => resolveAiringStatus(a) === 'airing')
                    };
                }
                return array.filter((a) => resolveAiringStatus(a) === 'airing');
            }
            fetchAndRender(fetchFiltered, `season_${year}_${season}`);
        } else if (tabId === 'completed_spec') {
            const { year, season } = params;
            const fetchFiltered = async () => {
                const payload = await api.getSeasonalAnime(year, season, 1);
                const array = Array.isArray(payload) ? payload : (payload?.data || []);

                // Return structured object if that's what's expected,
                // but `fetchAndRender` extracts `payload?.data` so we can just return array.
                // Though, let's keep the identical payload structure
                if (!Array.isArray(payload) && payload?.data) {
                    return {
                        ...payload,
                        data: payload.data.filter((a) => resolveAiringStatus(a) === 'completed')
                    };
                }
                return array.filter((a) => resolveAiringStatus(a) === 'completed');
            }
            fetchAndRender(fetchFiltered, `completed_${year}_${season}`);
        } else if (tabId === 'upcoming_spec') {
            const { year, season } = params;
            const fetchFiltered = async () => {
                const payload = await api.getSeasonalAnime(year, season, 1);
                const array = Array.isArray(payload) ? payload : (payload?.data || []);
                if (!Array.isArray(payload) && payload?.data) {
                    return {
                        ...payload,
                        data: payload.data.filter((a) => resolveAiringStatus(a) === 'upcoming')
                    };
                }
                return array.filter((a) => resolveAiringStatus(a) === 'upcoming');
            }
            fetchAndRender(fetchFiltered, `upcoming_spec_${year}_${season}`);
        }
    });

    bindHoverPreviews(gridContainer, (malId) => {
        return findAnimeInCache(malId);
    });

    // ── "Add to List" button click ─────────────────────────────────────────────
    gridContainer.addEventListener('click', (e) => {
        const addBtn = e.target.closest('button[data-action="add-library"]');
        if (!addBtn) return;

        e.stopPropagation(); // Prevent card click from also firing

        const malId = addBtn.dataset.id;
        const targetAnime = findAnimeInCache(malId);

        if (!targetAnime) {
            toast?.show('Anime data not found', 'error');
            return;
        }

        // Add to watchlist immediately (Plan by default to keep Watchlist clean)
        if (libraryStore) {
            libraryStore.upsert({ ...targetAnime, status: STATUS.PLAN }, STATUS.PLAN);
            toast?.show(`Added "${targetAnime.title || 'Anime'}" to Plan to Watch ✓`);
        } else {
            toast?.show('Library not available', 'error');
        }
    });

    // ── Anime card image / body click → open info modal ───────────────────────
    gridContainer.addEventListener('anime-click', async (e) => {
        const { malId } = e.detail || {};
        if (!malId) return;

        const fallback = findAnimeInCache(malId);
        if (modal) {
            await modal.open(Number(malId), fallback || null);
        }
    });

    return {
        destroy() {
            activeRenderRequestId += 1;
            localMemCache.clear();
        }
    };
}

