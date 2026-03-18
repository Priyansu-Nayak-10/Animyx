jest.mock('axios', () => ({
  get: jest.fn()
}));

const request = require('supertest');
const { createHs256Token } = require('../support/jwt');

describe('route contracts', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'service-key';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    process.env.JWT_SECRET = 'test-secret';
    jest.resetModules();
  });

  test('GET /api/upcoming/live returns normalized list', async () => {
    const now = new Date().toISOString();
    const axios = require('axios');
    axios.get.mockResolvedValueOnce({
      data: {
        data: [{
          mal_id: 1,
          title: 'Sample Anime',
          images: { jpg: { image_url: 'img.jpg' } },
          episodes: 12,
          broadcast: { day: 'Monday', time: '23:30' },
          created_at: now
        }]
      }
    });

    const { createApp } = require('../../src/server');
    const app = createApp();
    const token = createHs256Token({
      sub: 'user-1',
      email: 'user@example.com',
      iss: 'https://example.supabase.co/auth/v1',
      exp: Math.floor(Date.now() / 1000) + 300
    }, process.env.JWT_SECRET);

    const res = await request(app)
      .get('/api/upcoming/live')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0]).toMatchObject({
      malId: 1,
      title: 'Sample Anime',
      source: 'jikan'
    });
  });
});
