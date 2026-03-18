const express = require('express');
const { scanAnimeNews } = require('../jobs/news.job.js');

const router = express.Router();

function isAdminKeyValid(req) {
  const configured = String(process.env.ADMIN_SCAN_KEY || '').trim();
  if (!configured) return false; // Fail closed if key is not configured securely
  const provided = String(req.headers['x-admin-key'] || '').trim();
  return provided && provided === configured;
}

router.post('/news/scan', async (req, res) => {
  try {
    if (!isAdminKeyValid(req)) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    await scanAnimeNews();
    return res.status(200).json({ success: true, message: 'News scan completed' });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to run news scan' });
  }
});

module.exports = router;

