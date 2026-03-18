const request = require('supertest');
const { createApp } = require('../../src/server');

// Mock Supabase
jest.mock('../../src/database/supabase', () => {
    return {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        upsert: jest.fn().mockResolvedValue({ data: [], error: null }),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'mock-user-1' }, error: null })
    };
});

// Mock Auth Middleware
jest.mock('../../src/middleware/auth', () => {
    return {
        authenticate: (req, res, next) => {
            req.user = { id: 'mock-user-1' };
            next();
        }
    };
});

describe('POST /api/import/mal', () => {
    let app;

    beforeAll(() => {
        app = createApp();
    });

    it('should return 400 if no file is uploaded', async () => {
        const response = await request(app)
            .post('/api/import/mal')
            .send();

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.error).toContain('No XML file received');
    });

    it('should successfully parse a valid MAL XML file', async () => {
        const mockXML = `
            <myanimelist>
                <myinfo>
                    <user_id>123</user_id>
                    <user_name>testuser</user_name>
                    <user_export_type>1</user_export_type>
                </myinfo>
                <anime>
                    <series_animedb_id>1</series_animedb_id>
                    <series_title>Cowboy Bebop</series_title>
                    <series_episodes>26</series_episodes>
                    <my_watched_episodes>26</my_watched_episodes>
                    <my_status>Completed</my_status>
                    <my_score>10</my_score>
                </anime>
                <anime>
                    <series_animedb_id>5</series_animedb_id>
                    <series_title>Cowboy Bebop: Tengoku no Tobira</series_title>
                    <series_episodes>1</series_episodes>
                    <my_watched_episodes>0</my_watched_episodes>
                    <my_status>Plan to Watch</my_status>
                    <my_score>0</my_score>
                </anime>
            </myanimelist>
        `;

        const response = await request(app)
            .post('/api/import/mal')
            .attach('malExport', Buffer.from(mockXML), 'export.xml');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.total).toBe(2);
        expect(response.body.data.imported).toBe(2);
        expect(response.body.data.skipped).toBe(0);
    });
});
