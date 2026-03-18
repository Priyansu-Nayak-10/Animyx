jest.mock('axios', () => ({
  get: jest.fn()
}));

jest.mock('../../src/database/supabase', () => ({
  from: jest.fn()
}));

const express = require('express');
const request = require('supertest');
const axios = require('axios');
const supabase = require('../../src/database/supabase');
const animeRoutes = require('../../src/routes/anime');

describe('anime api validation', () => {
  function createApp() {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: 'auth-user' };
      next();
    });
    app.use('/api/anime', animeRoutes.publicRouter);
    app.use('/api/anime', animeRoutes.privateRouter);
    return app;
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('rejects overly long search query', async () => {
    const app = createApp();
    const longQuery = 'a'.repeat(121);
    const res = await request(app).get(`/api/anime/search?q=${longQuery}`);
    expect(res.status).toBe(400);
  });

  test('rejects invalid malId for detail endpoint', async () => {
    const app = createApp();
    const res = await request(app).get('/api/anime/not-a-number');
    expect(res.status).toBe(400);
  });

  test('follows anime for authenticated user only', async () => {
    const upsert = jest.fn().mockResolvedValue({ error: null });
    supabase.from.mockReturnValue({ upsert });

    const app = createApp();
    const res = await request(app)
      .post('/api/anime/follow')
      .send({ mal_id: 25, user_id: 'attacker-user' });

    expect(res.status).toBe(200);
    expect(supabase.from).toHaveBeenCalledWith('anime_follows');
    expect(upsert).toHaveBeenCalledWith(
      { user_id: 'auth-user', mal_id: 25 },
      { onConflict: 'user_id,mal_id' }
    );
  });

  test('returns anime details for valid malId', async () => {
    axios.get.mockResolvedValueOnce({ data: { data: { mal_id: 1, title: 'A' } } });
    const app = createApp();
    const res = await request(app).get('/api/anime/1');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ mal_id: 1, title: 'A' });
  });

  test('passes through bounded limit for top anime', async () => {
    axios.get.mockResolvedValueOnce({ data: { data: [] } });
    const app = createApp();

    const res = await request(app).get('/api/anime/top?limit=12');

    expect(res.status).toBe(200);
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('/top/anime'),
      expect.objectContaining({
        params: expect.objectContaining({ page: 1, limit: 12 })
      })
    );
  });

  test('clamps seasonal limit to the supported Jikan maximum', async () => {
    axios.get.mockResolvedValueOnce({ data: { data: [] } });
    const app = createApp();

    const res = await request(app).get('/api/anime/season/2026/spring?limit=200');

    expect(res.status).toBe(200);
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('/seasons/2026/spring'),
      expect.objectContaining({
        params: expect.objectContaining({ page: 1, limit: 25 })
      })
    );
  });
});
