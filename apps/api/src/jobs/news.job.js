// Legacy adapter: keep import path stable while delegating to consolidated jobs module.
module.exports = {
  scanAnimeNews: require('./jobs.js').scanAnimeNews
};
