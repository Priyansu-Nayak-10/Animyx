/**
 * features/dashboard/dashboard.js
 * Facade for the new modular dashboard architecture.
 */

import { initHeroCarousel } from "./carousel.js";
import { initRecommendations } from "./recommendations.js";
import { initUpcomingWidget } from "./upcoming.js";
import { initClipCard, DASHBOARD_CLIP_KEY } from "./clipCard.js";
import { initMilestones } from "./milestones.js";
import { initTrackerFeed } from "./trackerFeed.js";
import { initInsights } from "./insights.js";
import { getTopOngoingAnikoto } from "../../core/appCore.js";

// Constants for backward compatibility (could be moved to shared-config later)
const NEWS_CACHE_KEY = "Animyx_live_news_cache_v1";
const NEWS_CACHE_TTL_MS = 30 * 60 * 1000;
const NEWS_REFRESH_INTERVAL_MS = 10 * 60 * 1000;
const NEWS_TOTAL_LIMIT = 5;

/**
 * Initializes all dashboard modules.
 * @param {Object} ctx Application context
 */
function initDashboardModules(ctx) {
  const heroCarousel = initHeroCarousel(ctx);
  const recommendations = initRecommendations(ctx);
  const upcomingWidget = initUpcomingWidget(ctx);
  const clipCard = initClipCard(ctx);

  return Object.freeze({
    heroCarousel,
    recommendations,
    upcomingWidget,
    clipCard,
    render() {
      const state = ctx?.store?.getState?.() || {};
      const libraryItems = ctx?.libraryStore?.getAll?.() || [];
      const topOngoing = getTopOngoingAnikoto(state, 10, libraryItems);
      heroCarousel?.render?.(topOngoing);
      recommendations?.render?.();
      upcomingWidget?.render?.();
      clipCard?.render?.();
    },
    destroy() {
      clipCard?.destroy?.();
      upcomingWidget?.destroy?.();
      recommendations?.destroy?.();
      heroCarousel?.destroy?.();
    }
  });
}

export {
  NEWS_CACHE_KEY,
  NEWS_CACHE_TTL_MS,
  NEWS_REFRESH_INTERVAL_MS,
  NEWS_TOTAL_LIMIT,
  DASHBOARD_CLIP_KEY,
  initDashboardModules,
  initMilestones,
  initTrackerFeed,
  initInsights
};
