'use strict';

/**
 * Rate limiter middleware.
 *
 * Uses Redis (via REDIS_URL env var) when available for distributed,
 * restart-safe rate limiting. Falls back to in-process node-cache for
 * local/offline development.
 *
 * Sliding-window counter: each key stores { count, resetAt }.
 * A new window opens once the previous window expires.
 */

const NodeCache = require('node-cache');

// ---------------------------------------------------------------------------
// Redis client (optional – only used when REDIS_URL is set)
// ---------------------------------------------------------------------------
let redis = null;

if (process.env.REDIS_URL) {
  try {
    const Redis = require('ioredis');
    const isTls = process.env.REDIS_URL.startsWith('rediss://');
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      enableOfflineQueue: false,
      // Accept self-signed certs on managed Redis (Upstash, Render, etc.)
      ...(isTls ? { tls: { rejectUnauthorized: false } } : {}),
    });

    redis.on('error', () => {
      // Swallow errors so a Redis hiccup never crashes the server.
      // The catch in getCount / increment will fall back to node-cache.
    });
  } catch {
    redis = null;
  }
}

// ---------------------------------------------------------------------------
// In-memory fallback
// ---------------------------------------------------------------------------
function createFallbackCache(ttlSeconds) {
  return new NodeCache({
    stdTTL: ttlSeconds,
    checkperiod: ttlSeconds,
    useClones: false,
  });
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a rate-limiter middleware.
 *
 * @param {object} options
 * @param {number} [options.windowMs=60_000]  - Window length in milliseconds.
 * @param {number} [options.max=240]          - Max requests per window.
 * @param {string} [options.keyPrefix='rl']   - Redis key namespace.
 */
function createRateLimiter({ windowMs = 60_000, max = 240, keyPrefix = 'rl' } = {}) {
  const ttlSeconds = Math.ceil(windowMs / 1000);
  const fallback = createFallbackCache(ttlSeconds);

  function getClientKey(req) {
    // Prefer authenticated user ID; then fall back to remote IP (trust proxy).
    return `${keyPrefix}:${String(req?.user?.id || req.ip || 'unknown')}`;
  }

  // ------------------------------------------------------------------
  // Redis helpers (sliding fixed-window via INCR + EXPIRE)
  // ------------------------------------------------------------------
  async function redisIncrement(key) {
    try {
      if (!redis || redis.status !== 'ready') return null;
      const count = await redis.incr(key);
      if (count === 1) {
        // First request in window – set expiry
        await redis.expire(key, ttlSeconds);
      }
      // Get the remaining TTL for X-RateLimit-Reset header
      const ttl = await redis.ttl(key);
      const resetAt = Date.now() + (ttl > 0 ? ttl * 1000 : windowMs);
      return { count, resetAt };
    } catch {
      return null; // Signal to caller to use fallback
    }
  }

  // ------------------------------------------------------------------
  // In-process helpers (node-cache fallback)
  // ------------------------------------------------------------------
  function fallbackIncrement(key) {
    const now = Date.now();
    let current = fallback.get(key);
    if (!current || now > current.resetAt) {
      current = { count: 0, resetAt: now + windowMs };
    }
    current.count += 1;
    fallback.set(key, current, Math.max(1, Math.ceil((current.resetAt - now) / 1000)));
    return current;
  }

  // ------------------------------------------------------------------
  // Middleware
  // ------------------------------------------------------------------
  return async function rateLimit(req, res, next) {
    if (process.env.NODE_ENV === 'test') return next();

    const key = getClientKey(req);
    let result = await redisIncrement(key);

    if (!result) {
      // Redis unavailable – use in-process store
      result = fallbackIncrement(key);
    }

    const { count, resetAt } = result;

    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - count)));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(resetAt / 1000)));

    if (count > max) {
      return res.status(429).json({
        success: false,
        error: 'Too many requests. Please retry shortly.',
        retryAfter: Math.ceil((resetAt - Date.now()) / 1000),
      });
    }

    return next();
  };
}

module.exports = { createRateLimiter };
