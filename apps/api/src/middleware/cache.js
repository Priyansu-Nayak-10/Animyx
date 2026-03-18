/**
 * Caching middleware with Redis first, in-memory fallback.
 */
const NodeCache = require('node-cache');
const Redis = require('ioredis');
const { logger } = require('../utils');

const redisUrl = process.env.REDIS_URL;
const cacheNamespace = process.env.CACHE_NAMESPACE || 'Animyx:v1';
const isTestEnv = process.env.NODE_ENV === 'test';
let redis = null;

if (redisUrl && !isTestEnv) {
    const isTls = redisUrl.startsWith('rediss://');
    redis = new Redis(redisUrl, { 
        enableReadyCheck: true,
        maxRetriesPerRequest: null,
        ...(isTls ? { tls: { rejectUnauthorized: false } } : {})
    });
    redis.on('error', (err) => logger.error(`[Redis] ${err.message}`));
    redis.on('connect', () => logger.info('[Redis] connected'));
} else if (!isTestEnv) {
    logger.warn('[Cache] REDIS_URL not set; falling back to in-memory cache');
}

// In-memory fallback cache (used when Redis unavailable)
const memoryCache = new NodeCache({ checkperiod: 120, useClones: false });

/**
 * Express middleware factory that adds in-memory caching for GET responses.
 *
 * @param {number} ttlSeconds - Time-to-live in seconds
 * @returns {import('express').RequestHandler}
 *
 * @example
 * router.get('/top', checkCache(86400), async (req, res) => { ... });
 */
function checkCache(ttlSeconds) {
    return (req, res, next) => {
        if (req.method !== 'GET') return next();
        if (req.user) return next(); // defensively avoid caching authenticated responses
        const key = `${cacheNamespace}:${req.originalUrl}`;

        (async () => {
            // Try Redis first
            if (redis && redis.status === 'ready') {
                try {
                    const hit = await redis.get(key);
                    if (hit) {
                        logger.info(`[Cache HIT][redis] ${key}`);
                        return res.status(200).json(JSON.parse(hit));
                    }
                    logger.info(`[Cache MISS][redis] ${key}`);
                    return interceptResponse(key, ttlSeconds, res, next, true);
                } catch (err) {
                    logger.warn(`[Cache][redis] error, falling back: ${err.message}`);
                }
            }

            // Fallback to in-memory
            const cached = memoryCache.get(key);
            if (cached !== undefined) {
                logger.info(`[Cache HIT][mem]  ${key}`);
                return res.status(200).json(cached);
            }
            logger.info(`[Cache MISS][mem] ${key}`);
            return interceptResponse(key, ttlSeconds, res, next, false);
        })().catch(next);
    };
}

function interceptResponse(key, ttlSeconds, res, next, useRedis) {
    const originalJson = res.json.bind(res);
    res.json = (body) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
            if (useRedis && redis && redis.status === 'ready') {
                redis.set(key, JSON.stringify(body), 'EX', ttlSeconds).catch((err) => {
                    logger.warn(`[Cache][redis] set failed: ${err.message}`);
                });
            } else {
                memoryCache.set(key, body, ttlSeconds);
            }
        }
        return originalJson(body);
    };
    return next();
}

/**
 * Returns cache statistics for admin/health endpoints.
 * @returns {{ backend: 'redis'|'memory', redisStatus?: string, keys: number, hits?: number, misses?: number, ksize?: number, vsize?: number }}
 */
function getCacheStats() {
    if (redis && redis.status === 'ready') {
        return { backend: 'redis', redisStatus: redis.status };
    }
    return { backend: 'memory', redisStatus: redis?.status, ...memoryCache.getStats() };
}

/**
 * Manually flush the entire cache. Useful for admin endpoints.
 */
function flushCache() {
    if (redis && redis.status === 'ready') {
        redis.flushdb().catch((err) => logger.warn(`[Cache][redis] flush failed: ${err.message}`));
        logger.info('[Cache][redis] Cache flushed.');
        return;
    }
    memoryCache.flushAll();
    logger.info('[Cache][mem] Cache flushed.');
}

module.exports = { checkCache, getCacheStats, flushCache };
