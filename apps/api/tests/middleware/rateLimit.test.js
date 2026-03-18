const express = require('express');
const request = require('supertest');
const { createRateLimiter } = require('../../src/middleware/rateLimit');

describe('rate limiter middleware', () => {
  test('limits requests after configured threshold', async () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      const app = express();
      app.use((req, res, next) => {
        req.user = { id: 'user-1' };
        next();
      });
      app.use(createRateLimiter({ windowMs: 60_000, max: 2 }));
      app.get('/ping', (req, res) => res.json({ ok: true }));

      const one = await request(app).get('/ping');
      const two = await request(app).get('/ping');
      const three = await request(app).get('/ping');

      expect(one.status).toBe(200);
      expect(two.status).toBe(200);
      expect(three.status).toBe(429);
      expect(three.body.error).toMatch(/Too many requests/i);
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });
});
