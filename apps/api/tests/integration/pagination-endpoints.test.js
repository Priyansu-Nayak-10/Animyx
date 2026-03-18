/**
 * Integration Tests for Paginated Endpoints
 * 
 * Tests for pagination in actual API endpoints
 * Covers: response format, pagination metadata, data integrity
 */

const request = require('supertest');
const { app } = require('../../src/server');

describe('Paginated Endpoints Integration', () => {
  
  describe('GET /api/users/me/followed - Followed Anime List', () => {
    test('returns paginated response with default page 1', async () => {
      const response = await request(app)
        .get('/api/users/me/followed')
        .set('Authorization', `Bearer ${process.env.TEST_TOKEN}`);
      
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('meta');
      expect(Array.isArray(response.body.data)).toBe(true);
    });
    
    test('returns pagination metadata', async () => {
      const response = await request(app)
        .get('/api/users/me/followed')
        .set('Authorization', `Bearer ${process.env.TEST_TOKEN}`);
      
      const { meta } = response.body;
      expect(meta).toHaveProperty('currentPage', 1);
      expect(meta).toHaveProperty('pageSize');
      expect(meta).toHaveProperty('totalCount');
      expect(meta).toHaveProperty('pages');
      expect(meta).toHaveProperty('hasNext');
      expect(meta).toHaveProperty('hasPrev', false);
    });
    
    test('returns correct page size', async () => {
      const response = await request(app)
        .get('/api/users/me/followed?limit=25')
        .set('Authorization', `Bearer ${process.env.TEST_TOKEN}`);
      
      expect(response.body.meta.pageSize).toBe(25);
      expect(response.body.data.length).toBeLessThanOrEqual(25);
    });
    
    test('enforces maximum page size', async () => {
      const response = await request(app)
        .get('/api/users/me/followed?limit=200')
        .set('Authorization', `Bearer ${process.env.TEST_TOKEN}`);
      
      // Max should be enforced
      expect(response.body.meta.pageSize).toBeLessThanOrEqual(100);
    });
    
    test('navigation: can go to next page', async () => {
      const page1 = await request(app)
        .get('/api/users/me/followed?page=1&limit=10')
        .set('Authorization', `Bearer ${process.env.TEST_TOKEN}`);
      
      if (page1.body.meta.hasNext) {
        const page2 = await request(app)
          .get('/api/users/me/followed?page=2&limit=10')
          .set('Authorization', `Bearer ${process.env.TEST_TOKEN}`);
        
        expect(page2.status).toBe(200);
        expect(page2.body.meta.currentPage).toBe(2);
        expect(page2.body.meta.hasPrev).toBe(true);
      }
    });
    
    test('rejects invalid page number', async () => {
      const response = await request(app)
        .get('/api/users/me/followed?page=0')
        .set('Authorization', `Bearer ${process.env.TEST_TOKEN}`);
      
      // Should either normalize to page 1 or return error
      expect([200, 400]).toContain(response.status);
    });
    
    test('rejects invalid limit', async () => {
      const response = await request(app)
        .get('/api/users/me/followed?limit=-10')
        .set('Authorization', `Bearer ${process.env.TEST_TOKEN}`);
      
      expect([200, 400]).toContain(response.status);
    });
  });
  
  describe('GET /api/users/me/recommendations - Recommendations List', () => {
    test('returns paginated recommendations', async () => {
      const response = await request(app)
        .get('/api/users/me/recommendations')
        .set('Authorization', `Bearer ${process.env.TEST_TOKEN}`);
      
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('meta');
    });
    
    test('respects default page size of 20', async () => {
      const response = await request(app)
        .get('/api/users/me/recommendations')
        .set('Authorization', `Bearer ${process.env.TEST_TOKEN}`);
      
      expect(response.body.data.length).toBeLessThanOrEqual(20);
      expect(response.body.meta.pageSize).toBe(20);
    });
    
    test('enforces max limit of 50', async () => {
      const response = await request(app)
        .get('/api/users/me/recommendations?limit=100')
        .set('Authorization', `Bearer ${process.env.TEST_TOKEN}`);
      
      expect(response.body.meta.pageSize).toBeLessThanOrEqual(50);
    });
    
    test('pagination links work correctly', async () => {
      const page1 = await request(app)
        .get('/api/users/me/recommendations?page=1')
        .set('Authorization', `Bearer ${process.env.TEST_TOKEN}`);
      
      if (page1.body.meta.hasNext) {
        const page2 = await request(app)
          .get('/api/users/me/recommendations?page=2')
          .set('Authorization', `Bearer ${process.env.TEST_TOKEN}`);
        
        expect(page2.status).toBe(200);
        // Data should be different between pages
        const ids1 = page1.body.data.map(d => d.id);
        const ids2 = page2.body.data.map(d => d.id);
        expect(ids1.some(id => !ids2.includes(id))).toBe(true);
      }
    });
  });
  
  describe('GET /api/users/community/activity - Community Activity', () => {
    test('returns paginated activity feed', async () => {
      const response = await request(app)
        .get('/api/users/community/activity')
        .set('Authorization', `Bearer ${process.env.TEST_TOKEN}`);
      
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('meta');
    });
    
    test('respects default page size of 50', async () => {
      const response = await request(app)
        .get('/api/users/community/activity')
        .set('Authorization', `Bearer ${process.env.TEST_TOKEN}`);
      
      if (response.body.data.length > 0) {
        expect(response.body.meta.pageSize).toBe(50);
      }
    });
    
    test('enforces max limit of 100', async () => {
      const response = await request(app)
        .get('/api/users/community/activity?limit=500')
        .set('Authorization', `Bearer ${process.env.TEST_TOKEN}`);
      
      expect(response.body.meta.pageSize).toBeLessThanOrEqual(100);
    });
    
    test('maintains chronological order', async () => {
      const response = await request(app)
        .get('/api/users/community/activity?limit=100')
        .set('Authorization', `Bearer ${process.env.TEST_TOKEN}`);
      
      const items = response.body.data;
      if (items.length > 1) {
        // Verify items are in reverse chronological order
        for (let i = 0; i < items.length - 1; i++) {
          const time1 = new Date(items[i].created_at || items[i].timestamp);
          const time2 = new Date(items[i + 1].created_at || items[i + 1].timestamp);
          expect(time1.getTime()).toBeGreaterThanOrEqual(time2.getTime());
        }
      }
    });
  });
  
  describe('GET /api/notifications/me - User Notifications', () => {
    test('returns paginated notifications', async () => {
      const response = await request(app)
        .get('/api/notifications/me')
        .set('Authorization', `Bearer ${process.env.TEST_TOKEN}`);
      
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('meta');
    });
    
    test('respects default page size of 30', async () => {
      const response = await request(app)
        .get('/api/notifications/me')
        .set('Authorization', `Bearer ${process.env.TEST_TOKEN}`);
      
      expect(response.body.meta.pageSize).toBe(30);
      expect(response.body.data.length).toBeLessThanOrEqual(30);
    });
    
    test('enforces max limit of 100', async () => {
      const response = await request(app)
        .get('/api/notifications/me?limit=200')
        .set('Authorization', `Bearer ${process.env.TEST_TOKEN}`);
      
      expect(response.body.meta.pageSize).toBeLessThanOrEqual(100);
    });
    
    test('returns most recent notifications first', async () => {
      const response = await request(app)
        .get('/api/notifications/me?limit=100')
        .set('Authorization', `Bearer ${process.env.TEST_TOKEN}`);
      
      const items = response.body.data;
      if (items.length > 1) {
        for (let i = 0; i < items.length - 1; i++) {
          const time1 = new Date(items[i].created_at);
          const time2 = new Date(items[i + 1].created_at);
          expect(time1.getTime()).toBeGreaterThanOrEqual(time2.getTime());
        }
      }
    });
  });
  
  describe('GET /api/notifications/news - Anime News & Events', () => {
    test('returns paginated news items', async () => {
      const response = await request(app)
        .get('/api/notifications/news')
        .set('Authorization', `Bearer ${process.env.TEST_TOKEN}`);
      
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('meta');
    });
    
    test('respects default page size of 30', async () => {
      const response = await request(app)
        .get('/api/notifications/news')
        .set('Authorization', `Bearer ${process.env.TEST_TOKEN}`);
      
      expect(response.body.meta.pageSize).toBe(30);
    });
    
    test('enforces max limit of 100', async () => {
      const response = await request(app)
        .get('/api/notifications/news?limit=300')
        .set('Authorization', `Bearer ${process.env.TEST_TOKEN}`);
      
      expect(response.body.meta.pageSize).toBeLessThanOrEqual(100);
    });
    
    test('pagination across news pages works', async () => {
      const page1 = await request(app)
        .get('/api/notifications/news?page=1&limit=5')
        .set('Authorization', `Bearer ${process.env.TEST_TOKEN}`);
      
      if (page1.body.meta.hasNext) {
        const page2 = await request(app)
          .get('/api/notifications/news?page=2&limit=5')
          .set('Authorization', `Bearer ${process.env.TEST_TOKEN}`);
        
        expect(page2.body.meta.currentPage).toBe(2);
        expect(page2.body.meta.hasPrev).toBe(true);
      }
    });
  });
  
  describe('Pagination Edge Cases', () => {
    test('handles request for page beyond available data', async () => {
      const response = await request(app)
        .get('/api/notifications/me?page=999999&limit=10')
        .set('Authorization', `Bearer ${process.env.TEST_TOKEN}`);
      
      // Should return empty data or normalize
      expect([200, 204]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body.data.length).toBe(0);
      }
    });
    
    test('handles limit of 1', async () => {
      const response = await request(app)
        .get('/api/users/me/followed?limit=1')
        .set('Authorization', `Bearer ${process.env.TEST_TOKEN}`);
      
      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeLessThanOrEqual(1);
    });
    
    test('handles string page parameter', async () => {
      const response = await request(app)
        .get('/api/users/me/followed?page=abc&limit=10')
        .set('Authorization', `Bearer ${process.env.TEST_TOKEN}`);
      
      // Should normalize or reject gracefully
      expect([200, 400]).toContain(response.status);
    });
    
    test('handles float page parameter', async () => {
      const response = await request(app)
        .get('/api/users/me/followed?page=1.5&limit=10')
        .set('Authorization', `Bearer ${process.env.TEST_TOKEN}`);
      
      // Should normalize to integer
      expect(response.status).toBe(200);
      expect(Number.isInteger(response.body.meta.currentPage)).toBe(true);
    });
  });
  
  describe('Response Integrity', () => {
    test('all items in response have expected structure', async () => {
      const response = await request(app)
        .get('/api/users/me/followed?limit=5')
        .set('Authorization', `Bearer ${process.env.TEST_TOKEN}`);
      
      if (response.body.data.length > 0) {
        response.body.data.forEach(item => {
          expect(item).toHaveProperty('id');
          expect(typeof item.id).not.toBe('undefined');
        });
      }
    });
    
    test('metadata accurately reflects data', async () => {
      const response = await request(app)
        .get('/api/notifications/me?limit=20')
        .set('Authorization', `Bearer ${process.env.TEST_TOKEN}`);
      
      const { data, meta } = response.body;
      
      // If we're on a page with data, ensure counts are reasonable
      if (data.length > 0) {
        expect(meta.pageSize).toBeGreaterThanOrEqual(data.length);
      }
      
      // If it says there's no next page, we should be on last page
      if (!meta.hasNext) {
        expect(meta.currentPage).toBeLessThanOrEqual(meta.pages);
      }
    });
  });
  
  describe('Performance', () => {
    test('pagination response time is acceptable', async () => {
      const start = Date.now();
      
      await request(app)
        .get('/api/users/me/followed?limit=50')
        .set('Authorization', `Bearer ${process.env.TEST_TOKEN}`);
      
      const duration = Date.now() - start;
      
      // Should respond within 500ms (with index optimization)
      expect(duration).toBeLessThan(500);
    });
  });
});
