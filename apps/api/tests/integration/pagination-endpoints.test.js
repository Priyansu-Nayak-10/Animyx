/**
 * Integration Tests for Paginated Endpoints
 *
 * Deterministic contract tests that validate pagination behavior without
 * relying on external Supabase/Jikan infrastructure.
 */

jest.mock('../../src/database/supabase', () => {
  const USER_ID = 'user-1';
  const now = Date.now();

  const followedAnime = Array.from({ length: 120 }, (_, index) => ({
    id: index + 1,
    user_id: USER_ID,
    mal_id: 1000 + index,
    title: `Anime ${index + 1}`,
    status: index % 4 === 0 ? 'watching' : 'plan',
    updated_at: new Date(now - index * 60000).toISOString()
  }));

  const userRecommendations = [{
    user_id: USER_ID,
    updated_at: new Date(now).toISOString(),
    recommendations: Array.from({ length: 80 }, (_, index) => ({
      id: index + 1,
      malId: 2000 + index,
      title: `Recommended ${index + 1}`
    }))
  }];

  const notifications = Array.from({ length: 65 }, (_, index) => ({
    id: index + 1,
    user_id: USER_ID,
    is_read: index % 3 === 0,
    created_at: new Date(now - index * 30000).toISOString(),
    event: {
      type: index % 2 === 0 ? 'SEQUEL_ANNOUNCED' : 'NEWS',
      message: `Notification ${index + 1}`,
      mal_id: 3000 + (index % 12)
    }
  }));

  const animeFollows = Array.from({ length: 8 }, (_, index) => ({
    user_id: USER_ID,
    mal_id: 3000 + index
  }));

  const animeEvents = Array.from({ length: 40 }, (_, index) => ({
    id: index + 1,
    type: 'NEWS',
    mal_id: 3000 + (index % 8),
    message: `News ${index + 1}`,
    source_url: `https://example.com/news/${index + 1}`,
    created_at: new Date(now - index * 45000).toISOString()
  }));

  const tables = {
    followed_anime: followedAnime,
    user_recommendations: userRecommendations,
    notifications,
    anime_follows: animeFollows,
    anime_events: animeEvents
  };

  class MockQuery {
    constructor(tableName) {
      this.tableName = tableName;
      this.filters = [];
      this.inFilters = [];
      this.orderBy = null;
      this.rangeBounds = null;
      this.headCount = false;
      this.single = false;
    }

    select(_columns, options = {}) {
      this.headCount = Boolean(options?.head);
      return this;
    }

    eq(field, value) {
      this.filters.push({ field, value });
      return this;
    }

    in(field, values) {
      this.inFilters.push({ field, values: Array.isArray(values) ? values : [] });
      return this;
    }

    order(field, options = {}) {
      this.orderBy = { field, ascending: options?.ascending !== false };
      return this;
    }

    range(start, end) {
      this.rangeBounds = { start: Number(start), end: Number(end) };
      return this.execute();
    }

    maybeSingle() {
      this.single = true;
      return this.execute();
    }

    execute() {
      let rows = Array.isArray(tables[this.tableName]) ? [...tables[this.tableName]] : [];

      this.filters.forEach(({ field, value }) => {
        rows = rows.filter((row) => row?.[field] === value);
      });

      this.inFilters.forEach(({ field, values }) => {
        const allowed = new Set(values);
        rows = rows.filter((row) => allowed.has(row?.[field]));
      });

      if (this.orderBy) {
        const { field, ascending } = this.orderBy;
        rows.sort((left, right) => {
          const a = left?.[field];
          const b = right?.[field];
          if (a === b) return 0;
          if (a == null) return ascending ? -1 : 1;
          if (b == null) return ascending ? 1 : -1;
          if (a > b) return ascending ? 1 : -1;
          return ascending ? -1 : 1;
        });
      }

      const total = rows.length;

      if (this.headCount) {
        return Promise.resolve({ data: null, error: null, count: total });
      }

      if (this.rangeBounds) {
        const { start, end } = this.rangeBounds;
        rows = rows.slice(Math.max(0, start), Math.max(0, end) + 1);
      }

      if (this.single) {
        return Promise.resolve({ data: rows[0] || null, error: null });
      }

      return Promise.resolve({ data: rows, error: null, count: total });
    }

    then(resolve, reject) {
      return this.execute().then(resolve, reject);
    }
  }

  return {
    from(tableName) {
      return new MockQuery(tableName);
    }
  };
});

const request = require('supertest');
const { createHs256Token } = require('../support/jwt');
const { createApp } = require('../../src/server');

describe('Paginated Endpoints Integration', () => {
  let app;

  beforeAll(() => {
    process.env.NODE_ENV = 'test';
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'service-key';
    process.env.JWT_SECRET = 'test-secret';

    process.env.TEST_TOKEN = createHs256Token({
      sub: 'user-1',
      email: 'user@example.com',
      iss: 'https://example.supabase.co/auth/v1',
      exp: Math.floor(Date.now() / 1000) + 300
    }, process.env.JWT_SECRET);

    app = createApp();
  });

  function authedGet(path) {
    return request(app)
      .get(path)
      .set('Authorization', `Bearer ${process.env.TEST_TOKEN}`);
  }

  test('GET /api/users/me/followed returns paginated payload', async () => {
    const res = await authedGet('/api/users/me/followed');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toMatchObject({ page: 1, limit: 50, total: 120 });
    expect(res.body.data.length).toBeLessThanOrEqual(50);
  });

  test('GET /api/users/me/followed rejects limit above schema max', async () => {
    const res = await authedGet('/api/users/me/followed?limit=200');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('GET /api/users/me/recommendations paginates at default 20', async () => {
    const page1 = await authedGet('/api/users/me/recommendations');
    const page2 = await authedGet('/api/users/me/recommendations?page=2');

    expect(page1.status).toBe(200);
    expect(page1.body.meta).toMatchObject({ page: 1, limit: 20, total: 80 });
    expect(page1.body.data.length).toBeLessThanOrEqual(20);

    expect(page2.status).toBe(200);
    const ids1 = page1.body.data.map((row) => row.id);
    const ids2 = page2.body.data.map((row) => row.id);
    expect(ids1.some((id) => !ids2.includes(id))).toBe(true);
  });

  test('GET /api/users/community/activity returns pagination envelope', async () => {
    const res = await authedGet('/api/users/community/activity');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toHaveProperty('page');
    expect(res.body.meta).toHaveProperty('limit');
    expect(res.body.meta).toHaveProperty('total');
  });

  test('GET /api/notifications/me returns latest notifications first', async () => {
    const res = await authedGet('/api/notifications/me?limit=30');

    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({ page: 1, limit: 30 });

    const items = res.body.data;
    for (let i = 0; i < items.length - 1; i += 1) {
      const t1 = new Date(items[i].created_at).getTime();
      const t2 = new Date(items[i + 1].created_at).getTime();
      expect(t1).toBeGreaterThanOrEqual(t2);
    }
  });

  test('GET /api/notifications/news rejects limit above schema max', async () => {
    const res = await authedGet('/api/notifications/news?limit=300&page=2');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('page beyond available data returns empty list', async () => {
    const res = await authedGet('/api/notifications/me?page=999999&limit=10');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(0);
  });

  test('pagination response remains performant', async () => {
    const start = Date.now();
    const res = await authedGet('/api/users/me/followed?limit=50');
    const duration = Date.now() - start;

    expect(res.status).toBe(200);
    expect(duration).toBeLessThan(500);
  });
});
