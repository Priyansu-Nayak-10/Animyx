const { getIO } = require('./config/socket');
const Redis = require('ioredis');
const { logger } = require('./utils');

const REDIS_URL = process.env.REDIS_URL;
let redis = null;
if (REDIS_URL) {
  try {
    const isTls = REDIS_URL.startsWith('rediss://');
    redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: null,
      ...(isTls ? { tls: { rejectUnauthorized: false } } : {})
    });
  } catch (err) {
    logger.error('Failed to init Redis for presence data', { error: err.message });
  }
}

const MAX_ACTIVITIES = 25;
const fallbackMemoryActivities = [];

async function recordActivity(userProfile, action, stringPayload) {
  if (!userProfile || !userProfile.id || !userProfile.name) return;

  const activityEvent = {
    id: `act_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    user: {
      name: userProfile.name,
      avatar: userProfile.avatar || '/images/default_avatar.png',
      id: userProfile.id
    },
    action: String(action),
    payload: stringPayload,
    timestamp: new Date().toISOString()
  };

  try {
    if (redis && redis.status === 'ready') {
      await redis.lpush('animex:live_activity', JSON.stringify(activityEvent));
      await redis.ltrim('animex:live_activity', 0, MAX_ACTIVITIES - 1);
    } else {
      fallbackMemoryActivities.unshift(activityEvent);
      if (fallbackMemoryActivities.length > MAX_ACTIVITIES) {
        fallbackMemoryActivities.pop();
      }
    }

    try {
      getIO().emit('live_activity', activityEvent);
    } catch {
      // Ignore if socket io isn't initialized yet
    }
  } catch (err) {
    logger.error('[Presence] Error recording activity', { error: err.message });
  }
}

async function getRecentActivities() {
  try {
    if (redis && redis.status === 'ready') {
      const list = await redis.lrange('animex:live_activity', 0, MAX_ACTIVITIES - 1);
      return list.map((item) => JSON.parse(item));
    }
  } catch (err) {
    logger.error('[Presence] Redis fetch error', { error: err.message });
  }
  return [...fallbackMemoryActivities];
}

module.exports = {
  recordActivity,
  getRecentActivities
};

