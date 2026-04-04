// Legacy adapter: keep import path stable while delegating to consolidated jobs module.
module.exports = {
  buildRecommendations: require('./jobs.js').buildRecommendations
};
