const { authenticate } = require('../../src/middleware/auth');
const { createHs256Token } = require('../support/jwt');

describe('auth middleware', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret';
    process.env.SUPABASE_URL = 'https://example.supabase.co';
  });

  test('attaches req.user for valid bearer token', async () => {
    const token = createHs256Token({
      sub: 'user-1',
      email: 'user@example.com',
      iss: 'https://example.supabase.co/auth/v1',
      exp: Math.floor(Date.now() / 1000) + 60
    }, process.env.JWT_SECRET);

    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toMatchObject({ id: 'user-1', email: 'user@example.com' });
  });

  test('returns 401 for invalid token', async () => {
    const req = { headers: { authorization: 'Bearer invalid.token.here' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
