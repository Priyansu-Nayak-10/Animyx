/**
 * Validation schemas for API endpoints using Zod
 * These ensure consistent, type-safe input validation across all routes
 */

const { z } = require('zod');

// ============================================================================
// Anime Discovery Schemas
// ============================================================================

const AnimeSearchSchema = z.object({
  q: z.string()
    .min(1, 'Search query required')
    .max(100, 'Query too long (max 100 chars)')
    .optional()
    .default(''),
  page: z.coerce.number()
    .int()
    .positive('Page must be positive')
    .optional()
    .default(1),
  limit: z.coerce.number()
    .int()
    .min(1, 'Limit must be at least 1')
    .max(50, 'Limit too high (max 50)')
    .optional()
    .default(25),
  // Discovery filter fields — must be explicitly listed so Zod does not strip them
  genres: z.string().optional(),
  tags: z.string().optional(),
  type: z.string().optional(),
  status: z.string().optional(),
  rating: z.string().optional(),
  min_score: z.coerce.number().optional(),
  max_score: z.coerce.number().optional(),
  min_episodes: z.coerce.number().int().optional(),
  max_episodes: z.coerce.number().int().optional(),
  order_by: z.string().optional(),
  sort: z.string().optional(),
  year: z.coerce.number().int().optional(),
  year_from: z.coerce.number().int().optional(),
  year_to: z.coerce.number().int().optional()
});

const AnimeSeasonSchema = z.object({
  year: z.coerce.number()
    .int()
    .min(1917, 'Year too early')
    .max(2100, 'Year too far in future'),
  season: z.enum(['winter', 'spring', 'summer', 'fall'])
    .transform(s => s.toLowerCase())
});

const AnimeMalIdSchema = z.object({
  malId: z.coerce.number()
    .int()
    .positive('Invalid anime ID')
});

// ============================================================================
// User Library Schemas
// ============================================================================

const LibraryStatusEnum = z.enum(['plan', 'watching', 'completed', 'dropped']);

const LibraryUpdateSchema = z.object({
  status: LibraryStatusEnum.optional(),
  nextEpisode: z.coerce.number()
    .int()
    .min(1, 'Episode must be at least 1')
    .optional(),
  userRating: z.coerce.number()
    .min(0, 'Rating must be between 0 and 10')
    .max(10, 'Rating must be between 0 and 10')
    .optional(),
  watchProgressAt: z.string()
    .datetime('Invalid date format')
    .optional(),
  dubAvailable: z.boolean().optional()
});

const LibraryAddSchema = z.object({
  malId: z.coerce.number().int().positive(),
  status: LibraryStatusEnum.optional().default('plan'),
  nextEpisode: z.coerce.number().int().min(1).optional().default(1)
});

// ============================================================================
// User Settings Schemas
// ============================================================================

const ThemeEnum = z.enum(['light', 'dark']);

const TitleLangEnum = z.enum(['english', 'japanese']);

const AccentColorEnum = z.string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color');

const UserSettingsSchema = z.object({
  darkTheme: z.boolean().optional(),
  notifications: z.boolean().optional(),
  autoplay: z.boolean().optional(),
  dataSaver: z.boolean().optional(),
  titleLang: TitleLangEnum.optional(),
  defaultStatus: LibraryStatusEnum.optional(),
  accentColor: AccentColorEnum.optional()
});

const UserProfileSchema = z.object({
  name: z.string().max(100).optional(),
  bio: z.string().max(500).optional(),
  avatar: z.string().url().optional(),
  banner: z.string().url().optional(),
  mal: z.string().optional(),
  al: z.string().optional()
});

// ============================================================================
// Notification Schemas
// ============================================================================

const NotificationReadSchema = z.object({
  ids: z.array(z.number().int().positive())
    .min(1, 'At least one notification ID required')
    .max(1000, 'Too many notifications at once')
});

// ============================================================================
// Import Schemas
// ============================================================================

const MALImportSchema = z.object({
  xmlData: z.string().min(10, 'Invalid XML data'),
  mergeMode: z.enum(['replace', 'merge', 'skip_duplicates'])
    .optional()
    .default('merge')
});

// ============================================================================
// Pagination Schemas
// ============================================================================

const PaginationSchema = z.object({
  page: z.coerce.number()
    .int()
    .positive('Page must be positive')
    .optional()
    .default(1),
  limit: z.coerce.number()
    .int()
    .min(1, 'Limit must be at least 1')
    .max(100, 'Limit too high (max 100)')
    .optional()
    .default(25)
});

// ============================================================================
// Helper: Create middleware for query validation
// ============================================================================

/**
 * Create validation middleware for query parameters
 * @param {z.ZodSchema} schema - Zod validation schema
 * @returns {Function} Express middleware
 */
function validateQuery(schema) {
  return (req, res, next) => {
    try {
      req.query = schema.parse(req.query);
      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        const errors = err.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message
        }));
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors
        });
      }
      return res.status(400).json({ success: false, error: 'Invalid input' });
    }
  };
}

/**
 * Create validation middleware for request body
 * @param {z.ZodSchema} schema - Zod validation schema
 * @returns {Function} Express middleware
 */
function validateBody(schema) {
  return (req, res, next) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        const errors = err.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message
        }));
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors
        });
      }
      return res.status(400).json({ success: false, error: 'Invalid input' });
    }
  };
}

/**
 * Create validation middleware for path parameters
 * @param {z.ZodSchema} schema - Zod validation schema
 * @returns {Function} Express middleware
 */
function validateParams(schema) {
  return (req, res, next) => {
    try {
      req.params = schema.parse(req.params);
      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        const errors = err.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message
        }));
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors
        });
      }
      return res.status(400).json({ success: false, error: 'Invalid parameters' });
    }
  };
}

module.exports = {
  // Schemas
  AnimeSearchSchema,
  AnimeSeasonSchema,
  AnimeMalIdSchema,
  LibraryUpdateSchema,
  LibraryAddSchema,
  UserSettingsSchema,
  UserProfileSchema,
  NotificationReadSchema,
  MALImportSchema,
  PaginationSchema,
  
  // Enums & types
  LibraryStatusEnum,
  ThemeEnum,
  TitleLangEnum,
  
  // Middleware factories
  validateQuery,
  validateBody,
  validateParams
};
