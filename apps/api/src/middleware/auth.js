'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const { apiError, logger } = require('../utils');

// ---------------------------------------------------------------------------
// Supabase admin client (singleton)
// ---------------------------------------------------------------------------
let supabaseAdmin = null;
function getSupabaseAdmin() {
  if (supabaseAdmin) return supabaseAdmin;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !serviceKey) return null;
  supabaseAdmin = createClient(supabaseUrl, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
  return supabaseAdmin;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function readBearerToken(value) {
  if (!value || typeof value !== 'string') return null;
  const [scheme, token] = value.trim().split(/\s+/);
  if (!/^Bearer$/i.test(scheme) || !token) return null;
  return token;
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// ---------------------------------------------------------------------------
// Core token verification
// ---------------------------------------------------------------------------
async function verifyToken(token) {
  const supabaseUrl = String(process.env.SUPABASE_URL || '');
  const publicKey = process.env.SUPABASE_JWT_PUBLIC_KEY;
  const jwtSecret = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET;

  // Parse header without verifying to determine algorithm
  const decodedUnverified = jwt.decode(token, { complete: true });
  if (!decodedUnverified) throw new Error('Malformed token');

  const alg = decodedUnverified.header.alg;
  let lastError = null;

  try {
    if (alg === 'RS256' && publicKey) {
      const verifiedPayload = jwt.verify(token, publicKey, { algorithms: ['RS256'] });
      if (!verifiedPayload?.sub || !verifiedPayload.exp) throw new Error('Invalid payload');
      if (supabaseUrl && verifiedPayload?.iss && !String(verifiedPayload.iss).startsWith(`${supabaseUrl}/auth/v1`)) {
        throw new Error('Invalid token issuer');
      }
      return {
        id: verifiedPayload.sub,
        email: verifiedPayload.email || null,
        emailVerified: Boolean(verifiedPayload.email_confirmed_at),
        claims: verifiedPayload
      };
    }

    if (alg === 'HS256' && jwtSecret) {
      const verifiedPayload = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
      if (!verifiedPayload?.sub || !verifiedPayload.exp) throw new Error('Invalid payload');
      return {
        id: verifiedPayload.sub,
        email: verifiedPayload.email || null,
        emailVerified: Boolean(verifiedPayload.email_confirmed_at),
        claims: verifiedPayload
      };
    }
  } catch (err) {
    lastError = err;
  }

  // Fallback: ask Supabase to validate using the service role key.
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error('No JWT keys configured and Supabase admin client unavailable');

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    const message = error?.message || lastError?.message || 'Unknown auth error';
    throw new Error(`Supabase token validation failed: ${message}`);
  }

  if (supabaseUrl && decodedUnverified?.payload?.iss && !String(decodedUnverified.payload.iss).startsWith(`${supabaseUrl}/auth/v1`)) {
    throw new Error('Invalid token issuer on fallback validation');
  }

  return {
    id: data.user.id,
    email: data.user.email || null,
    emailVerified: Boolean(data.user.email_confirmed_at),
    claims: data.user
  };
}

// ---------------------------------------------------------------------------
// Middleware: authenticate all requests
// ---------------------------------------------------------------------------
async function authenticate(req, res, next) {
  try {
    const token = readBearerToken(req.headers.authorization);
    if (!token) {
      logger.warn('Auth: missing token', { route: req.originalUrl, ip: req.ip });
      return apiError(res, 'Unauthorized', 401);
    }
    req.user = await verifyToken(token);
    return next();
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      logger.warn('Auth: token verification failed', {
        error: err.message,
        route: req.originalUrl,
        ip: req.ip
      });
    }
    return apiError(res, 'Unauthorized', 401);
  }
}

// ---------------------------------------------------------------------------
// Middleware: require verified email before proceeding
// ---------------------------------------------------------------------------
function requireEmailVerified(req, res, next) {
  if (!req.user?.emailVerified) {
    logger.warn('Auth: unverified email attempted sensitive action', {
      userId: req.user?.id,
      route: req.originalUrl
    });
    return res.status(403).json({
      success: false,
      error: 'Email verification required. Please verify your email before proceeding.'
    });
  }
  return next();
}

// ---------------------------------------------------------------------------
// Socket.IO authentication
// ---------------------------------------------------------------------------
async function authenticateSocket(handshake) {
  const headerToken = readBearerToken(handshake?.headers?.authorization);
  const authToken = typeof handshake?.auth?.token === 'string'
    ? handshake.auth.token
    : null;
  const token = headerToken || authToken;
  if (!token) throw new Error('Unauthorized');
  return verifyToken(token);
}

module.exports = {
  authenticate,
  authenticateSocket,
  verifyToken,
  requireEmailVerified,
  safeEqual
};
