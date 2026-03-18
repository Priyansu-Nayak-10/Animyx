const express = require('express');
const request = require('supertest');
const { validate } = require('../../src/middleware/validate');

// Minimal app factory for testing
function makeApp(schema, handler) {
    const app = express();
    app.use(express.json());
    app.post('/test', validate(schema), handler || ((req, res) => res.json({ ok: true })));
    return app;
}

describe('validate middleware', () => {
    describe('required fields', () => {
        test('passes when required field is present', async () => {
            const app = makeApp({ body: { name: { type: 'string', required: true } } });
            const res = await request(app).post('/test').send({ name: 'Naruto' });
            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
        });

        test('returns 400 when required field is missing', async () => {
            const app = makeApp({ body: { name: { type: 'string', required: true } } });
            const res = await request(app).post('/test').send({});
            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.error).toMatch(/"name" is required/);
        });
    });

    describe('string type', () => {
        test('returns 400 when string exceeds maxLength', async () => {
            const app = makeApp({ body: { bio: { type: 'string', maxLength: 5 } } });
            const res = await request(app).post('/test').send({ bio: 'way too long string' });
            expect(res.status).toBe(400);
        });

        test('passes when string is within maxLength', async () => {
            const app = makeApp({ body: { bio: { type: 'string', maxLength: 100 } } });
            const res = await request(app).post('/test').send({ bio: 'short' });
            expect(res.status).toBe(200);
        });
    });

    describe('number type', () => {
        test('returns 400 when number is below min', async () => {
            const app = makeApp({ body: { score: { type: 'number', min: 1, max: 10 } } });
            const res = await request(app).post('/test').send({ score: 0 });
            expect(res.status).toBe(400);
        });

        test('returns 400 when number is above max', async () => {
            const app = makeApp({ body: { score: { type: 'number', min: 1, max: 10 } } });
            const res = await request(app).post('/test').send({ score: 11 });
            expect(res.status).toBe(400);
        });

        test('passes when number is within range', async () => {
            const app = makeApp({ body: { score: { type: 'number', min: 1, max: 10 } } });
            const res = await request(app).post('/test').send({ score: 7 });
            expect(res.status).toBe(200);
        });
    });

    describe('enum type', () => {
        test('returns 400 when value is not in enum', async () => {
            const app = makeApp({ body: { status: { type: 'string', enum: ['plan', 'watching', 'completed'] } } });
            const res = await request(app).post('/test').send({ status: 'invalid' });
            expect(res.status).toBe(400);
        });

        test('passes when value is in enum', async () => {
            const app = makeApp({ body: { status: { type: 'string', enum: ['plan', 'watching', 'completed'] } } });
            const res = await request(app).post('/test').send({ status: 'watching' });
            expect(res.status).toBe(200);
        });
    });

    describe('optional fields', () => {
        test('passes when optional field is absent', async () => {
            const app = makeApp({ body: { tags: { type: 'string' } } });
            const res = await request(app).post('/test').send({});
            expect(res.status).toBe(200);
        });
    });

    describe('query validation', () => {
        function makeGetApp(schema) {
            const app = express();
            app.get('/test', validate(schema), (req, res) => res.json({ ok: true }));
            return app;
        }

        test('validates query params and rejects missing required', async () => {
            const app = makeGetApp({ query: { q: { type: 'string', required: true } } });
            const res = await request(app).get('/test');
            expect(res.status).toBe(400);
        });

        test('passes when required query param is present', async () => {
            const app = makeGetApp({ query: { q: { type: 'string', required: true } } });
            const res = await request(app).get('/test?q=naruto');
            expect(res.status).toBe(200);
        });
    });
});
