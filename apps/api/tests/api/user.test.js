jest.mock('../../src/database/supabase', () => ({
  from: jest.fn()
}));

const express = require('express');
const request = require('supertest');
const supabase = require('../../src/database/supabase');
const userRoutes = require('../../src/routes/user');

describe('user api authorization', () => {
  test('uses authenticated user id for profile read', async () => {
    const eq = jest.fn().mockReturnValue({ maybeSingle: jest.fn().mockResolvedValue({ data: { user_id: 'auth-user' }, error: null }) });
    const select = jest.fn().mockReturnValue({ eq });
    supabase.from.mockReturnValue({ select });

    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: 'auth-user', email: 'u@example.com' };
      next();
    });
    app.use('/api/users', userRoutes);

    const res = await request(app).get('/api/users/me/profile');

    expect(res.status).toBe(200);
    expect(eq).toHaveBeenCalledWith('user_id', 'auth-user');
  });
});
