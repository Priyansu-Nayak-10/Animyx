jest.mock('../../src/database/supabase', () => ({
  from: jest.fn()
}));

const express = require('express');
const request = require('supertest');
const supabase = require('../../src/database/supabase');
const notificationRoutes = require('../../src/routes/notifications');

describe('notifications api', () => {
  test('returns only current user notifications', async () => {
    const limit = jest.fn().mockResolvedValue({
      data: [{
        id: 1,
        user_id: 'auth-user',
        is_read: false,
        created_at: new Date().toISOString(),
        event: { type: 'SEQUEL_ANNOUNCED', message: 'Update', mal_id: 10 }
      }],
      error: null
    });
    const order = jest.fn().mockReturnValue({ limit });
    const eq = jest.fn().mockReturnValue({ order });
    const select = jest.fn().mockReturnValue({ eq });
    supabase.from.mockReturnValue({ select });

    const app = express();
    app.use((req, res, next) => {
      req.user = { id: 'auth-user' };
      next();
    });
    app.use('/api/notifications', notificationRoutes);

    const res = await request(app).get('/api/notifications/me');

    expect(res.status).toBe(200);
    expect(eq).toHaveBeenCalledWith('user_id', 'auth-user');
    expect(res.body.data[0]).toMatchObject({ type: 'SEQUEL_ANNOUNCED', message: 'Update' });
  });
});
