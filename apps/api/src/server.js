require('dotenv').config({ quiet: true });

// Initialize Sentry early for error tracking
const {
  initializeSentry,
  sentryTracingMiddleware,
  sentryRequestMiddleware,
  sentryErrorHandler
} = require('./config/sentry');
initializeSentry();

const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { jikanClient, processAnimeList, nextAiringTimestamp, logger } = require('./utils');

const { DateTime } = require('luxon');
const { publicRouter: animePublicRoutes, privateRouter: animePrivateRoutes } = require('./routes/anime');
const userRoutes = require('./routes/user');
const notificationRoutes = require('./routes/notifications');
const adminRoutes = require('./routes/admin');
const { router: pushRoutes } = require('./routes/push');
const importRoutes = require('./routes/import');
const { authenticate } = require('./middleware/auth');
const { createRateLimiter } = require('./middleware/rateLimit');
const { checkCache, getCacheStats, flushCache } = require('./middleware/cache');
const { initSocket } = require('./config/socket');
const { initScheduler } = require('./jobs/jobs.js');
const { mountSwagger } = require('./config/swagger');

const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY'];

const PORT = Number(process.env.PORT || 5000);
const JIKAN = process.env.JIKAN_API_URL || 'https://api.jikan.moe/v4';

// Cache TTL
const TTL_12H = 12 * 60 * 60;



function normalizeUpcomingRow(row) {
  const malId = Number(row?.mal_id || 0);
  if (!malId) return null;

  const releaseTimestamp = nextAiringTimestamp({
    day: row?.broadcast?.day,
    time: row?.broadcast?.time
  });

  if (!releaseTimestamp) return null;

  return {
    malId,
    title: row?.title || `Anime #${malId}`,
    image: row?.images?.jpg?.large_image_url || row?.images?.jpg?.image_url || '',
    totalEpisodes: row?.episodes || null,
    releaseTimestamp: releaseTimestamp.timestamp || null,
    countdownSeconds: releaseTimestamp.countdownSeconds,
    isoUtc: releaseTimestamp.isoUtc || null,
    isoJst: releaseTimestamp.isoJst || null,
    source: 'jikan'
  };
}

function createApp() {
  for (const key of REQUIRED_ENV) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable ${key}`);
    }
  }

  const app = express();
  const helmet = require('helmet');
  const WEB_DIR = path.resolve(__dirname, '..', '..', '..', 'apps', 'web');
  const WEB_DIST = path.join(WEB_DIR, 'dist');
  const STATIC_DIR = fs.existsSync(WEB_DIST) ? WEB_DIST : WEB_DIR;

  // Initialize Sentry Tracing Middleware (must be early in the chain)
  app.use(sentryTracingMiddleware);

  // Trust proxy if behind a reverse proxy/load balancer
  if (process.env.TRUST_PROXY === '1') {
    app.set('trust proxy', 1);
  }

  // Configure CORS with explicit allowlist
  const rawOrigins = String(process.env.ALLOWED_ORIGINS || process.env.CLIENT_ORIGIN || '').trim();
  const allowedOrigins = rawOrigins
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);

  // Render provides the public URL for this service. Include it so CSP/CORS allow
  // websocket connections back to the same Render host (Socket.IO) in production.
  const renderExternalUrl = String(process.env.RENDER_EXTERNAL_URL || '').trim().replace(/\/$/, '');
  if (renderExternalUrl && !allowedOrigins.includes(renderExternalUrl)) {
    allowedOrigins.push(renderExternalUrl);
  }

  // Legacy default (kept on by default to avoid breaking existing deployments).
  // Set ALLOW_LEGACY_VERCEL_ORIGIN=0 to disable.
  const allowLegacyVercelOrigin = String(process.env.ALLOW_LEGACY_VERCEL_ORIGIN || '1') !== '0';
  if (allowLegacyVercelOrigin && !allowedOrigins.includes('https://animyx-psi.vercel.app')) {
    allowedOrigins.push('https://animyx-psi.vercel.app');
  }

  const isProd = process.env.NODE_ENV === 'production';

  const corsOptions = {
    origin(origin, callback) {
      if (!origin) return callback(null, true); // allow non-browser requests
      if (origin === 'null') return callback(null, true); // allow file:// and similar origins
      if (!allowedOrigins.length) {
        if (isProd) return callback(null, false); // restrict in production if no allowlist
        return callback(null, true);
      }
      if (allowedOrigins.includes(origin)) return callback(null, true);
      // Disallow without throwing to avoid 500 responses on static assets
      return callback(null, false);
    },
    credentials: true,
    optionsSuccessStatus: 204
  };

  // Security Headers (CSP opt-in via ENABLE_CSP=1, default on in prod)
  const enableCsp = process.env.ENABLE_CSP === '1' || isProd;
  const connectSrc = (() => {
    const list = ["'self'"];

    const addOriginAndWs = (value) => {
      try {
        const origin = new URL(value).origin;
        list.push(origin);
        const host = new URL(origin).host;
        if (host) {
          list.push(`wss://${host}`);
          list.push(`ws://${host}`);
        }
      } catch {}
    };

    for (const o of allowedOrigins) addOriginAndWs(o);
    addOriginAndWs(JIKAN);
    if (process.env.SUPABASE_URL) addOriginAndWs(process.env.SUPABASE_URL);

    // Supabase Realtime uses websocket URLs like:
    // wss://<project>.supabase.co/realtime/v1/websocket
    // Some browsers report CSP blocks unless wss is explicitly present.
    // Keep this scoped (not `wss:` globally).
    list.push('https://*.supabase.co');
    list.push('wss://*.supabase.co');

    // Socket.IO on Render uses secure websockets to the Render host (wss://*.onrender.com).
    // Allowing the onrender.com wildcard keeps this scoped to our hosting provider.
    list.push('https://*.onrender.com');
    list.push('wss://*.onrender.com');
    return Array.from(new Set(list));
  })();

  const helmetOptions = enableCsp
    ? {
        contentSecurityPolicy: {
          useDefaults: true,
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "cdn.jsdelivr.net", "https://cdn.socket.io"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
            fontSrc: ["'self'", "data:", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc,
            objectSrc: ["'none'"]
          }
        },
        referrerPolicy: { policy: 'no-referrer' },
        crossOriginOpenerPolicy: { policy: 'same-origin' },
        crossOriginResourcePolicy: { policy: 'cross-origin' }
      }
    : {
        contentSecurityPolicy: false,
        referrerPolicy: { policy: 'no-referrer' }
      };

  app.use(helmet(helmetOptions));

  // Sentry Request Context Middleware (capture request info)
  app.use(sentryRequestMiddleware);

  // CORS only for API routes to avoid affecting static asset delivery
  app.use('/api', cors(corsOptions));

  // Enforce strict JSON payload limits to prevent unbounded parsing DoS
  app.use(express.json({ limit: '10kb' }));

  // Runtime env injection for the frontend (prevents hardcoding keys in git-built assets).
  // This route intentionally comes before static serving so it wins over any built /env.js file.
  app.get('/env.js', (_req, res) => {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, max-age=0');

    const apiBase = '/api';
    const supabaseUrl = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
    const supabaseAnonKey = String(
      process.env.SUPABASE_ANON_KEY
      || process.env.SUPABASE_PUBLIC_ANON_KEY
      || process.env.VITE_SUPABASE_ANON_KEY
      || ''
    ).trim();

    // Keep it JS (not JSON) because pages include it as a script tag.
    const payload = {
      API_BASE: apiBase,
      SUPABASE_URL: supabaseUrl,
      SUPABASE_ANON_KEY: supabaseAnonKey
    };

    return res.status(200).send(`window.ENV = ${JSON.stringify(payload)};`);
  });

  app.get('/', (req, res) => res.redirect('/pages/signin.html'));
  app.use(express.static(STATIC_DIR, { index: false }));

  app.get('/health', (req, res) => res.json({ status: 'Animyx backend running' }));
  app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

  const apiLimiter = createRateLimiter({ windowMs: 60_000, max: 240 });
  const strictLimiter = createRateLimiter({ windowMs: 60_000, max: 90 });

  app.use('/api/anime', strictLimiter, animePublicRoutes);
  app.use('/api/anime', authenticate, strictLimiter, animePrivateRoutes);
  app.use('/api/users', authenticate, apiLimiter, userRoutes);
  // Alias: frontend uses /api/user (singular) — map it to the same router
  app.use('/api/user', authenticate, apiLimiter, userRoutes);
  app.use('/api/notifications', authenticate, apiLimiter, notificationRoutes);
  app.use('/api/push', authenticate, strictLimiter, pushRoutes);
  app.use('/api/admin', authenticate, strictLimiter, adminRoutes);
  app.use('/api/import', authenticate, strictLimiter, importRoutes);

  // Admin: cache stats & flush (authenticated admin routes)
  app.get('/api/admin/cache-stats', authenticate, strictLimiter, (_req, res) => {
    res.json({ success: true, data: getCacheStats() });
  });
  app.post('/api/admin/cache-flush', authenticate, strictLimiter, (_req, res) => {
    flushCache();
    res.json({ success: true, message: 'Cache flushed' });
  });

  app.get('/api/upcoming/live', strictLimiter, checkCache(TTL_12H), async (req, res) => {
    try {
      const limit = Math.max(1, Math.min(100, Number(req.query.limit || 50)));
      const data = await jikanClient.get(`${JIKAN}/seasons/now`, { params: { limit } });
      const rows = Array.isArray(data?.data) ? data.data : [];
      const processedRows = processAnimeList(rows);
      const result = processedRows
        .map(normalizeUpcomingRow)
        .filter(Boolean)
        .sort((a, b) => a.releaseTimestamp - b.releaseTimestamp)
        .slice(0, limit);

      return res.status(200).json({ success: true, data: result });
    } catch (error) {
      logger.error(error, { route: '/api/upcoming/live' });
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  mountSwagger(app);

  // Sentry Error Handler Middleware (must be before other error handlers)
  app.use(sentryErrorHandler);

  // Global error handler for async route errors
  app.use((err, req, res, next) => {
    logger.error('Unhandled error', err, {
      method: req.method,
      path: req.path,
      userId: req.user?.id,
      statusCode: err.status || 500
    });

    const status = err.status || 500;
    const message = process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message;

    res.status(status).json({
      success: false,
      error: message,
      ...(process.env.DEBUG && { stack: err.stack })
    });
  });

  // Route not found handler
  app.use((req, res) => {
    logger.warn('Route not found', { method: req.method, path: req.path });

    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ success: false, error: 'API endpoint not found' });
    }

    const isStaticAsset = /\.(js|css|png|jpg|jpeg|gif|svg|webp|ico|json|txt|map)$/i.test(req.path);
    if (isStaticAsset) return res.status(404).send('Not Found');

    return res.redirect('/pages/signin.html');
  });

  return app;
}

function startServer() {
  const app = createApp();
  const server = http.createServer(app);
  initSocket(server);

  try {
    initScheduler();
  } catch (err) {
    logger.error('Failed to initialize scheduler', { error: err.message });
  }
  
  server.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
  });

  return { app, server };
}

if (require.main === module) {
  startServer();
}

module.exports = { createApp, startServer };
