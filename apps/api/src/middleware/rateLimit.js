const NodeCache = require('node-cache');

function createRateLimiter({ windowMs = 60_000, max = 240 } = {}) {
  const ttlSeconds = Math.ceil(windowMs / 1000);
  const bucket = new NodeCache({ stdTTL: ttlSeconds, checkperiod: ttlSeconds, useClones: false });

  function getKey(req) {
    // Prefer authenticated user id; otherwise rely on Express-calculated req.ip (respecting trust proxy)
    return String(req?.user?.id || req.ip || 'unknown');
  }

  return function rateLimit(req, res, next) {
    if (process.env.NODE_ENV === 'test') return next();
    const now = Date.now();
    const key = getKey(req);
    
    let current = bucket.get(key);
    if (!current) {
        current = { count: 0, resetAt: now + windowMs };
    } else if (now > current.resetAt) {
        current = { count: 0, resetAt: now + windowMs };
    }

    current.count += 1;
    bucket.set(key, current, Math.max(1, Math.ceil((current.resetAt - now) / 1000)));

    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - current.count)));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(current.resetAt / 1000)));

    if (current.count > max) {
      return res.status(429).json({ error: 'Too many requests. Please retry shortly.' });
    }
    return next();
  };
}

module.exports = { createRateLimiter };
