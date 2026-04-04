/**
 * Tests for Pagination Utilities
 */

const {
  createPaginationQuery,
  createPaginationMeta,
  paginatedResponse,
  validatePaginationParams,
  getSafePaginationBounds,
  sqlLimit,
  getPaginationDefaults,
  PAGINATION_DEFAULTS,
  getCursorFromItem
} = require('../../src/utils/pagination');

describe('Pagination Utilities', () => {
  test('createPaginationQuery normalizes values and computes offset', () => {
    const result = createPaginationQuery(3, 25, 100);
    expect(result).toMatchObject({ page: 3, limit: 25, offset: 50 });
  });

  test('createPaginationQuery clamps invalid page and limit', () => {
    const result = createPaginationQuery(0, 999, 100);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(100);
    expect(result.offset).toBe(0);
  });

  test('createPaginationMeta returns expected envelope', () => {
    const meta = createPaginationMeta(75, 2, 25);
    expect(meta).toMatchObject({
      page: 2,
      limit: 25,
      total: 75,
      pages: 3,
      hasNext: true,
      hasPrev: true,
      startIndex: 25,
      endIndex: 49
    });
  });

  test('paginatedResponse wraps data and meta', () => {
    const data = [{ id: 1 }, { id: 2 }];
    const response = paginatedResponse(data, 10, 1, 5);

    expect(response.success).toBe(true);
    expect(response.data).toEqual(data);
    expect(response.meta).toMatchObject({ page: 1, limit: 5, total: 10, pages: 2 });
  });

  test('validatePaginationParams rejects invalid values', () => {
    expect(validatePaginationParams(0, 10)).toEqual({ valid: false, error: 'Page must be a positive number' });
    expect(validatePaginationParams(1, 0)).toEqual({ valid: false, error: 'Limit must be a positive number' });
    expect(validatePaginationParams(1, 101)).toEqual({ valid: false, error: 'Limit cannot exceed 100 items per page' });
  });

  test('getSafePaginationBounds applies defaults and bounds', () => {
    const bounds = getSafePaginationBounds(-3, 5000, { defaultLimit: 25, maxLimit: 50 });
    expect(bounds.page).toBe(1);
    expect(bounds.limit).toBe(50);
    expect(bounds.offset).toBe(0);
  });

  test('sqlLimit generates a sanitized SQL fragment', () => {
    expect(sqlLimit('100;DROP TABLE x', '7 OR 1=1')).toBe('LIMIT 25 OFFSET 0');
    expect(sqlLimit(10, 20)).toBe('LIMIT 10 OFFSET 20');
  });

  test('getPaginationDefaults returns entity config or default', () => {
    expect(getPaginationDefaults('notifications')).toEqual(PAGINATION_DEFAULTS.notifications);
    expect(getPaginationDefaults('unknown')).toEqual(PAGINATION_DEFAULTS.default);
  });

  test('PAGINATION_DEFAULTS shape is stable', () => {
    Object.values(PAGINATION_DEFAULTS).forEach((cfg) => {
      expect(cfg).toHaveProperty('page');
      expect(cfg).toHaveProperty('limit');
      expect(cfg).toHaveProperty('maxLimit');
      expect(cfg.maxLimit).toBeGreaterThanOrEqual(cfg.limit);
    });
  });

  test('getCursorFromItem returns selected field value', () => {
    expect(getCursorFromItem({ id: 42, updated_at: 'x' }, 'id')).toBe(42);
    expect(getCursorFromItem(null, 'id')).toBeNull();
  });
});
