/**
 * Sentry Configuration
 * 
 * Production error monitoring and performance tracking
 * Requires: SENTRY_DSN environment variable
 */

const Sentry = require('@sentry/node');
const { nodeProfilingIntegration } = require('@sentry/profiling-node');

/**
 * Initialize Sentry for error tracking and performance monitoring
 */
function initializeSentry() {
  if (!process.env.SENTRY_DSN) {
    console.warn('⚠️  SENTRY_DSN not configured - error tracking disabled');
    return;
  }

  Sentry.init({
    // DSN from Sentry project settings
    dsn: process.env.SENTRY_DSN,

    // Environment (development, staging, production)
    environment: process.env.NODE_ENV || 'development',

    // Release version for tracking
    release: process.env.APP_VERSION || '1.0.0',

    // Attach stack trace to all messages
    attachStacktrace: true,

    // Sample transactions for performance monitoring (0.1 = 10%)
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Profile sample rate (requires @sentry/profiling-node)
    profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Integrations
    integrations: [
      // Performance monitoring
      new Sentry.Integrations.Http({
        tracing: true,
        request: true
      }),
      new Sentry.Integrations.OnUncaughtException(),
      new Sentry.Integrations.OnUnhandledRejection(),
      
      // Database integration (if using Prisma/TypeORM)
      // new Sentry.Integrations.Prisma(),
      
      // Node profiling
      nodeProfilingIntegration()
    ],

    // Ignore specific errors
    ignoreErrors: [
      'NetworkError',
      'TimeoutError',
      'AbortError',
      // Ignore low-level socket errors
      /socket/i,
      /ECONNRESET/i,
      /ENOTFOUND/i
    ],

    // Maximum breadcrumbs to record
    maxBreadcrumbs: 50,

    // Denylist patterns to exclude
    denyUrls: [
      // Browser extensions
      /extensions\//i,
      /^chrome:\/\//i,
      // Third-party scripts
      /cdn\./i
    ],

    // Before sending errors, apply filters
    beforeSend(event, hint) {
      // Filter out specific errors
      if (event.exception) {
        const error = hint.originalException;

        // Don't send 404 errors (not a problem)
        if (error?.status === 404) {
          return null;
        }

        // Don't send timeout errors (temporary network issue)
        if (error?.code === 'ECONNABORTED') {
          return null;
        }
      }

      return event;
    }
  });

  console.log('✅ Sentry configured for error tracking');
}

/**
 * Middleware: Attach request info to Sentry context
 */
function sentryRequestMiddleware(req, res, next) {
  if (!process.env.SENTRY_DSN) return next();

  Sentry.configureScope((scope) => {
    scope.setUser({
      id: req.user?.id,
      email: req.user?.email,
      ip_address: req.ip
    });
    scope.setTags({
      method: req.method,
      path: req.path,
      status: res.statusCode
    });
    scope.setExtras({
      query: req.query,
      params: req.params
    });
  });

  next();
}

/**
 * Middleware: Capture Express errors with Sentry
 */
function sentryErrorHandler(err, req, res, next) {
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(err);
  }
  next(err);
}

/**
 * Middleware: Express Tracing Middleware
 * Automatically track HTTP requests for performance monitoring
 */
function sentryTracingMiddleware(req, res, next) {
  if (!process.env.SENTRY_DSN) return next();

  const transaction = Sentry.startTransaction({
    op: 'http.server',
    name: `${req.method} ${req.path}`,
    sampled: true
  });

  // Complete transaction when response is sent
  res.on('finish', () => {
    if (transaction) {
      transaction.setStatus(res.statusCode < 400 ? 'ok' : 'error');
      transaction.setTag('http.status', res.statusCode);
      transaction.finish();
    }
  });

  next();
}

/**
 * Configure alert rules in Sentry
 */
const alertRuleTemplates = {
  errorRate: {
    name: 'High Error Rate',
    condition: 'Error rate above 5% for 10 minutes',
    actions: ['Send email', 'Create PagerDuty incident']
  },

  performanceAlert: {
    name: 'Slow Transaction',
    condition: 'Transaction duration > 5000ms',
    filters: ['environment:production'],
    actions: ['Send email', 'Send Slack message']
  },

  criticalError: {
    name: 'Critical Error Detected',
    condition: 'Error level: fatal or critical',
    actions: ['Send email (immediate)', 'Create PagerDuty incident']
  },

  deploymentAlert: {
    name: 'New Release Errors',
    condition: 'Error spike after deployment',
    actions: ['Send Slack message', 'Create issue']
  }
};

/**
 * Create custom span for performance monitoring
 */
function createPerformanceSpan(operation, description) {
  const transaction = Sentry.getCurrentHub().getScope().getTransaction();
  if (transaction) {
    return transaction.startChild({
      op: operation,
      description: description,
      sampled: true
    });
  }
}

/**
 * Log performance metrics
 */
function captureMetric(name, value, unit = 'ms', _tags = {}) {
  Sentry.captureMessage(
    `Metric: ${name} = ${value}${unit}`,
    Sentry.SeverityLevel.Info
  );
}

/**
 * Export configuration
 */
module.exports = {
  initializeSentry,
  sentryRequestMiddleware,
  sentryErrorHandler,
  sentryTracingMiddleware,
  createPerformanceSpan,
  captureMetric,
  Sentry,
  alertRuleTemplates
};
