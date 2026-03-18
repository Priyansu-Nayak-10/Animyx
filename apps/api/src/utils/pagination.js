/**
 * Pagination Utility Functions
 * 
 * Provides consistent pagination logic across all list endpoints
 * Enforces safe limits and generates metadata for frontend
 */

/**
 * Parse and validate pagination parameters
 * @param {number} page - Requested page number (1-indexed)
 * @param {number} limit - Requested items per page
 * @param {number} maxLimit - Maximum allowed limit (enforce cap)
 * @returns {{page: number, limit: number, offset: number}}
 */
function createPaginationQuery(page = 1, limit = 25, maxLimit = 100) {
  // Ensure page is a positive integer
  const actualPage = Math.max(1, Math.floor(Number(page) || 1));
  
  // Ensure limit is within bounds
  const actualLimit = Math.max(1, Math.min(maxLimit, Math.floor(Number(limit) || 25)));
  
  // Calculate offset for database query
  const offset = (actualPage - 1) * actualLimit;

  return { page: actualPage, limit: actualLimit, offset };
}

/**
 * Generate pagination metadata for response
 * @param {number} total - Total count of items in dataset
 * @param {number} page - Current page number
 * @param {number} limit - Items per page
 * @returns {{page: number, limit: number, total: number, pages: number, hasNext: boolean, hasPrev: boolean}}
 */
function createPaginationMeta(total = 0, page = 1, limit = 25) {
  const totalPages = Math.ceil(Math.max(0, total) / Math.max(1, limit));
  const hasNext = page < totalPages;
  const hasPrev = page > 1;

  return {
    page,
    limit,
    total,
    pages: totalPages,
    hasNext,
    hasPrev,
    startIndex: (page - 1) * limit,
    endIndex: Math.min(page * limit - 1, Math.max(0, total - 1))
  };
}

/**
 * Standard pagination response wrapper
 * @param {Object} data - Array of items
 * @param {number} total - Total count
 * @param {number} page - Current page
 * @param {number} limit - Items per page
 * @returns {{success: boolean, data: Array, meta: Object}}
 */
function paginatedResponse(data = [], total = 0, page = 1, limit = 25) {
  return {
    success: true,
    data,
    meta: createPaginationMeta(total, page, limit)
  };
}

/**
 * Validate pagination query parameters
 * Returns user-friendly error if invalid
 * @param {number} page - Page number to validate
 * @param {number} limit - Limit to validate
 * @returns {{valid: boolean, error?: string}}
 */
function validatePaginationParams(page, limit) {
  const pageNum = Number(page);
  const limitNum = Number(limit);

  if (!Number.isFinite(pageNum) || pageNum < 1) {
    return { valid: false, error: 'Page must be a positive number' };
  }

  if (!Number.isFinite(limitNum) || limitNum < 1) {
    return { valid: false, error: 'Limit must be a positive number' };
  }

  if (limitNum > 100) {
    return { valid: false, error: 'Limit cannot exceed 100 items per page' };
  }

  return { valid: true };
}

/**
 * Helper for building pagination cursor (for alternate cursor-based pagination)
 * Useful for real-time feeds where offsets might be inaccurate
 * @param {*} lastItem - Previous last item from last pagearth
 * @param {string} field - Field to use as cursor (e.g., 'updated_at', 'id')
 * @returns {*} Cursor value
 */
function getCursorFromItem(lastItem, field = 'id') {
  if (!lastItem || !field) return null;
  return lastItem[field];
}

/**
 * Calculate safe LIMIT and OFFSET for database query
 * Prevents common SQL injection and resource exhaustion
 * @param {number} requestedPage - User-supplied page
 * @param {number} requestedLimit - User-supplied limit
 * @param {Object} options - Configuration options
 * @returns {{limit: number, offset: number, page: number}}
 */
function getSafePaginationBounds(requestedPage, requestedLimit, options = {}) {
  const {
    defaultPage = 1,
    defaultLimit = 25,
    maxLimit = 100,
    minLimit = 1
  } = options;

  const pageNum = Math.max(defaultPage, Math.min(9999, Math.floor(Number(requestedPage) || defaultPage)));
  const limitNum = Math.max(minLimit, Math.min(maxLimit, Math.floor(Number(requestedLimit) || defaultLimit)));
  const offset = (pageNum - 1) * limitNum;

  return { limit: limitNum, offset, page: pageNum };
}

/**
 * Generate LIMIT and OFFSET SQL snippet for query
 * @param {number} limit - Items per page
 * @param {number} offset - Items to skip
 * @returns {string} SQL fragment "LIMIT :limit OFFSET :offset"
 */
function sqlLimit(limit, offset) {
  const l = Math.max(1, Math.floor(Number(limit) || 25));
  const o = Math.max(0, Math.floor(Number(offset) || 0));
  return `LIMIT ${l} OFFSET ${o}`;
}

/**
 * Common pagination defaults by entity type
 */
const PAGINATION_DEFAULTS = {
  library: { page: 1, limit: 50, maxLimit: 100 },
  notifications: { page: 1, limit: 30, maxLimit: 100 },
  search: { page: 1, limit: 25, maxLimit: 50 },
  recommendations: { page: 1, limit: 20, maxLimit: 50 },
  news: { page: 1, limit: 15, maxLimit: 50 },
  default: { page: 1, limit: 25, maxLimit: 100 }
};

/**
 * Get defaults for entity type
 * @param {string} entityType - Type of entity being paginated
 * @returns {Object} Default pagination config
 */
function getPaginationDefaults(entityType = 'default') {
  return PAGINATION_DEFAULTS[entityType] || PAGINATION_DEFAULTS.default;
}

module.exports = {
  createPaginationQuery,
  createPaginationMeta,
  paginatedResponse,
  validatePaginationParams,
  getCursorFromItem,
  getSafePaginationBounds,
  sqlLimit,
  PAGINATION_DEFAULTS,
  getPaginationDefaults
};
