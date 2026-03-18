/**
 * Tests for Pagination Utilities
 * 
 * Unit tests for all pagination functions
 * Covers: validation, bounds checking, SQL generation, response formatting
 */

const {
  createPaginationQuery,
  createPaginationMeta,
  paginatedResponse,
  validatePaginationParams,
  getSafePaginationBounds,
  sqlLimit,
  getPaginationDefaults,
  validateAndNormalize,
  PAGINATION_DEFAULTS
} = require('../../utils/pagination');

describe('Pagination Utilities', () => {
  
  describe('validatePaginationParams', () => {
    test('accepts valid page and limit', () => {
      const result = validatePaginationParams(1, 50);
      expect(result).toEqual({ valid: true });
    });
    
    test('rejects page 0', () => {
      const result = validatePaginationParams(0, 50);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('page');
    });
    
    test('rejects negative page', () => {
      const result = validatePaginationParams(-1, 50);
      expect(result.valid).toBe(false);
    });
    
    test('rejects zero limit', () => {
      const result = validatePaginationParams(1, 0);
      expect(result.valid).toBe(false);
    });
    
    test('rejects negative limit', () => {
      const result = validatePaginationParams(1, -10);
      expect(result.valid).toBe(false);
    });
    
    test('accepts large valid page number', () => {
      const result = validatePaginationParams(1000, 50);
      expect(result.valid).toBe(true);
    });
    
    test('accepts large valid limit', () => {
      const result = validatePaginationParams(1, 1000);
      expect(result.valid).toBe(true);
    });
  });
  
  describe('getSafePaginationBounds', () => {
    test('enforces minimum page 1', () => {
      const result = getSafePaginationBounds(0, 50);
      expect(result.page).toBe(1);
    });
    
    test('enforces maximum limit from options', () => {
      const result = getSafePaginationBounds(1, 1000, { maxLimit: 100 });
      expect(result.limit).toBe(100);
    });
    
    test('allows limit under maximum', () => {
      const result = getSafePaginationBounds(1, 50, { maxLimit: 100 });
      expect(result.limit).toBe(50);
    });
    
    test('returns offset calculation', () => {
      const result = getSafePaginationBounds(2, 20);
      expect(result.offset).toBe(20); // (2-1) * 20
    });
    
    test('handles page 1 with offset 0', () => {
      const result = getSafePaginationBounds(1, 50);
      expect(result.offset).toBe(0);
    });
    
    test('handles large page numbers', () => {
      const result = getSafePaginationBounds(100, 20);
      expect(result.offset).toBe(1980); // (100-1) * 20
    });
  });
  
  describe('createPaginationQuery', () => {
    test('returns valid pagination object', () => {
      const result = createPaginationQuery(1, 50);
      expect(result).toHaveProperty('page');
      expect(result).toHaveProperty('limit');
      expect(result).toHaveProperty('offset');
    });
    
    test('calculates offset correctly', () => {
      const result = createPaginationQuery(3, 25);
      expect(result.offset).toBe(50); // (3-1) * 25
    });
    
    test('applies max limit constraint', () => {
      const result = createPaginationQuery(1, 5000, 100);
      expect(result.limit).toBe(100);
    });
    
    test('returns page 1 on invalid input', () => {
      const result = createPaginationQuery(0, 50);
      expect(result.page).toBe(1);
    });
    
    test('returns default limit on invalid', () => {
      const result = createPaginationQuery(1, 0);
      expect(result.limit).toBeGreaterThan(0);
    });
  });
  
  describe('sqlLimit', () => {
    test('generates correct SQL LIMIT OFFSET', () => {
      const sql = sqlLimit(50, 0);
      expect(sql).toMatch(/LIMIT 50/);
      expect(sql).toMatch(/OFFSET 0/);
    });
    
    test('handles non-zero offset', () => {
      const sql = sqlLimit(25, 50);
      expect(sql).toMatch(/LIMIT 25/);
      expect(sql).toMatch(/OFFSET 50/);
    });
    
    test('prevents SQL injection in limit', () => {
      const sql = sqlLimit("100; DROP TABLE users;", 0);
      expect(sql).not.toContain('DROP');
    });
    
    test('generates integer-safe SQL', () => {
      const sql = sqlLimit(5000, 10000);
      expect(sql).toMatch(/^\d+\s+/);
    });
  });
  
  describe('createPaginationMeta', () => {
    test('calculates pages correctly', () => {
      const meta = createPaginationMeta(100, 1, 25);
      expect(meta.pages).toBe(4);
    });
    
    test('calculates hasNext correctly', () => {
      const meta1 = createPaginationMeta(100, 1, 50); // Page 1 of 2
      expect(meta1.hasNext).toBe(true);
      
      const meta2 = createPaginationMeta(100, 2, 50); // Page 2 of 2
      expect(meta2.hasNext).toBe(false);
    });
    
    test('calculates hasPrev correctly', () => {
      const meta1 = createPaginationMeta(100, 1, 50);
      expect(meta1.hasPrev).toBe(false);
      
      const meta2 = createPaginationMeta(100, 2, 50);
      expect(meta2.hasPrev).toBe(true);
    });
    
    test('includes all required fields', () => {
      const meta = createPaginationMeta(50, 1, 10);
      expect(meta).toHaveProperty('currentPage');
      expect(meta).toHaveProperty('pageSize');
      expect(meta).toHaveProperty('totalCount');
      expect(meta).toHaveProperty('pages');
      expect(meta).toHaveProperty('hasNext');
      expect(meta).toHaveProperty('hasPrev');
    });
    
    test('handles empty result set', () => {
      const meta = createPaginationMeta(0, 1, 50);
      expect(meta.pages).toBe(0);
      expect(meta.hasNext).toBe(false);
      expect(meta.hasPrev).toBe(false);
    });
  });
  
  describe('paginatedResponse', () => {
    test('returns standard response format', () => {
      const data = [{ id: 1 }, { id: 2 }];
      const response = paginatedResponse(data, 10, 1, 5);
      
      expect(response).toHaveProperty('data');
      expect(response).toHaveProperty('meta');
      expect(response.data).toEqual(data);
    });
    
    test('wraps data in response', () => {
      const data = [{ id: 1 }];
      const response = paginatedResponse(data, 1, 1, 10);
      
      expect(Array.isArray(response.data)).toBe(true);
      expect(response.data.length).toBe(1);
    });
    
    test('generates correct metadata', () => {
      const response = paginatedResponse([1, 2, 3], 100, 2, 50);
      
      expect(response.meta.currentPage).toBe(2);
      expect(response.meta.pageSize).toBe(50);
      expect(response.meta.totalCount).toBe(100);
    });
  });
  
  describe('getPaginationDefaults', () => {
    test('returns defaults for library entity', () => {
      const defaults = getPaginationDefaults('library');
      expect(defaults).toHaveProperty('defaultLimit');
      expect(defaults).toHaveProperty('maxLimit');
      expect(defaults.defaultLimit).toBeGreaterThan(0);
    });
    
    test('returns defaults for notifications', () => {
      const defaults = getPaginationDefaults('notifications');
      expect(defaults.defaultLimit).toBe(30);
      expect(defaults.maxLimit).toBe(100);
    });
    
    test('returns defaults for search', () => {
      const defaults = getPaginationDefaults('search');
      expect(defaults.defaultLimit).toBe(25);
    });
    
    test('returns defaults for recommendations', () => {
      const defaults = getPaginationDefaults('recommendations');
      expect(defaults.defaultLimit).toBe(20);
    });
    
    test('returns generic defaults for unknown entity', () => {
      const defaults = getPaginationDefaults('unknown');
      expect(defaults).toBeDefined();
      expect(defaults.defaultLimit).toBeGreaterThan(0);
    });
  });
  
  describe('validateAndNormalize', () => {
    test('returns valid pagination object', () => {
      const result = validateAndNormalize(1, 50, 'library');
      expect(result).toHaveProperty('page');
      expect(result).toHaveProperty('limit');
      expect(result).toHaveProperty('offset');
    });
    
    test('applies entity-specific defaults', () => {
      const result1 = validateAndNormalize(1, 50, 'library');
      const result2 = validateAndNormalize(1, 50, 'notifications');
      
      // Both should be valid but may enforce different limits
      expect(result1.page).toBe(1);
      expect(result2.page).toBe(1);
    });
    
    test('normalizes invalid input', () => {
      const result = validateAndNormalize(0, -50, 'search');
      expect(result.page).toBeGreaterThanOrEqual(1);
      expect(result.limit).toBeGreaterThan(0);
    });
    
    test('enforces entity max limits', () => {
      const result = validateAndNormalize(1, 5000, 'search');
      expect(result.limit).toBeLessThanOrEqual(PAGINATION_DEFAULTS.search.maxLimit);
    });
  });
  
  describe('PAGINATION_DEFAULTS constant', () => {
    test('defines all entity types', () => {
      expect(PAGINATION_DEFAULTS).toHaveProperty('library');
      expect(PAGINATION_DEFAULTS).toHaveProperty('notifications');
      expect(PAGINATION_DEFAULTS).toHaveProperty('search');
      expect(PAGINATION_DEFAULTS).toHaveProperty('recommendations');
    });
    
    test('each entity has required fields', () => {
      Object.entries(PAGINATION_DEFAULTS).forEach(([entity, config]) => {
        expect(config).toHaveProperty('defaultLimit');
        expect(config).toHaveProperty('maxLimit');
        expect(config.maxLimit).toBeGreaterThanOrEqual(config.defaultLimit);
      });
    });
  });
  
  describe('Integration: Full flow', () => {
    test('complete pagination flow from params to response', () => {
      // Parse input
      const params = createPaginationQuery(2, 25);
      
      // Generate SQL
      const sqlFragment = sqlLimit(params.limit, params.offset);
      
      // Mock data result
      const mockData = Array.from({ length: 25 }, (_, i) => ({ id: i + 1 }));
      const totalCount = 75;
      
      // Format response
      const response = paginatedResponse(mockData, totalCount, params.page, params.limit);
      
      // Verify complete flow
      expect(response.meta.currentPage).toBe(2);
      expect(response.meta.pageSize).toBe(25);
      expect(response.meta.totalCount).toBe(75);
      expect(response.meta.pages).toBe(3);
      expect(response.meta.hasNext).toBe(true);
      expect(response.meta.hasPrev).toBe(true);
      expect(response.data.length).toBe(25);
    });
    
    test('edge case: last page with partial results', () => {
      const params = createPaginationQuery(3, 25);
      const mockData = Array.from({ length: 10 }, (_, i) => ({ id: i + 1 })); // Last page has 10 items
      const totalCount = 60;
      
      const response = paginatedResponse(mockData, totalCount, params.page, params.limit);
      
      expect(response.meta.pages).toBe(3);
      expect(response.meta.hasNext).toBe(false);
      expect(response.data.length).toBe(10);
    });
  });
  
  describe('Error handling', () => {
    test('handles non-integer page gracefully', () => {
      const result = validateAndNormalize('not-a-number', 50, 'library');
      expect(result.page).toBe(1);
    });
    
    test('handles non-integer limit gracefully', () => {
      const result = validateAndNormalize(1, 'not-a-number', 'library');
      expect(result.limit).toBeGreaterThan(0);
    });
    
    test('handles null values', () => {
      const result = validateAndNormalize(null, null, 'library');
      expect(result.page).toBe(1);
      expect(result.limit).toBeGreaterThan(0);
    });
    
    test('handles undefined values', () => {
      const result = validateAndNormalize(undefined, undefined, 'library');
      expect(result.page).toBe(1);
      expect(result.limit).toBeGreaterThan(0);
    });
  });
});
