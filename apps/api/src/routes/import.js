/**
 * Animex — MAL XML Import API
 *
 * POST /api/import/mal
 *   Accepts a MyAnimeList XML data export, parses it, and bulk-upserts
 *   the user's anime list into their Animex `followed_anime` library.
 */
const express = require('express');
const multer = require('multer');
const xml2js = require('xml2js');
const supabase = require('../database/supabase');
const { apiResponse, apiError, logger } = require('../utils');

const router = express.Router();

// ─────────────────────────────────────────
//  Multer configuration — memory storage only (no disk writes)
// ─────────────────────────────────────────
const ALLOWED_MIME_TYPES = new Set([
    'text/xml',
    'application/xml',
    'application/octet-stream' // some browsers send .xml as this
]);
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE_BYTES },
    fileFilter(_req, file, cb) {
        const isXml = ALLOWED_MIME_TYPES.has(file.mimetype) ||
            String(file.originalname || '').toLowerCase().endsWith('.xml');
        if (isXml) return cb(null, true);
        cb(new Error('Only .xml files are accepted'));
    }
});

// ─────────────────────────────────────────
//  Status mapping: MAL → Animex
// ─────────────────────────────────────────
const STATUS_MAP = {
    'completed': 'completed',
    'watching': 'watching',
    'plan to watch': 'plan',
    'on-hold': 'plan',      // map on-hold → plan
    'dropped': 'dropped'
};

function mapStatus(malStatus) {
    return STATUS_MAP[String(malStatus || '').toLowerCase()] || 'plan';
}

// ─────────────────────────────────────────
//  Parse MyAnimeList XML buffer → array of entries
// ─────────────────────────────────────────
async function parseMalXml(buffer) {
    const parser = new xml2js.Parser({ explicitArray: false, trim: true });
    const result = await parser.parseStringPromise(buffer.toString('utf8'));

    const animeList = result?.myanimelist?.anime;
    if (!animeList) return [];

    // xml2js gives an object when there's only one entry, or an array for many
    const entries = Array.isArray(animeList) ? animeList : [animeList];

    return entries
        .map(entry => {
            const malId = Number(entry?.series_animedb_id);
            if (!malId) return null;

            return {
                mal_id: malId,
                title: String(entry?.series_title || `Anime #${malId}`).slice(0, 255),
                status: mapStatus(entry?.my_status),
                next_episode: Math.max(0, Number(entry?.my_watched_episodes) || 0),
                total_episodes: Math.max(0, Number(entry?.series_episodes) || 0),
                is_airing: false // MAL exports don't reliably carry this
            };
        })
        .filter(Boolean);
}

// ─────────────────────────────────────────
//  Bulk upsert to Supabase in chunks
// ─────────────────────────────────────────
const CHUNK_SIZE = 50;

async function bulkUpsert(userId, entries) {
    let inserted = 0;
    let skipped = 0;

    for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
        const chunk = entries.slice(i, i + CHUNK_SIZE).map(e => ({
            ...e,
            user_id: userId
        }));

        const { error, count } = await supabase
            .from('followed_anime')
            .upsert(chunk, { onConflict: 'user_id, mal_id', count: 'exact' });

        if (error) {
            logger.error(error, { context: 'MAL import bulkUpsert', userId, chunk: i });
            skipped += chunk.length;
        } else {
            inserted += count ?? chunk.length;
        }
    }

    return { inserted, skipped };
}

// ─────────────────────────────────────────
//  Route: POST /api/import/mal
// ─────────────────────────────────────────

/**
 * @swagger
 * /api/import/mal:
 *   post:
 *     summary: Import a MyAnimeList XML export into the user's Animex library
 *     tags: [Import]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               malExport:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Import summary { total, imported, skipped }
 *       400:
 *         description: Bad request (no file, wrong format, parse error)
 *       401:
 *         description: Unauthorized
 */
router.post('/mal', upload.single('malExport'), async (req, res) => {
    try {
        if (!req.file) {
            return apiError(res, 'No XML file received. Please upload your MAL export.', 400);
        }

        const userId = req.user?.id;
        if (!userId) return apiError(res, 'Unauthorized', 401);

        let entries;
        try {
            entries = await parseMalXml(req.file.buffer);
        } catch (parseErr) {
            logger.error(parseErr, { context: 'MAL XML parse', userId });
            return apiError(res, 'Failed to parse XML file. Make sure it is a valid MyAnimeList export.', 400);
        }

        if (!entries.length) {
            return apiError(res, 'No anime entries found in the XML file.', 400);
        }

        const { inserted, skipped } = await bulkUpsert(userId, entries);

        logger.info(`[MAL Import] user=${userId} total=${entries.length} inserted=${inserted} skipped=${skipped}`);

        return apiResponse(res, {
            total: entries.length,
            imported: inserted,
            skipped
        }, 200, `Successfully imported ${inserted} of ${entries.length} anime entries.`);

    } catch (err) {
        return apiError(res, 'Import failed', 500, err);
    }
});

// Handle multer errors (e.g. file too large, wrong type)
router.use((err, _req, res, _next) => {
    if (err instanceof multer.MulterError || err?.message?.includes('xml')) {
        return res.status(400).json({ success: false, error: err.message });
    }
    return res.status(500).json({ success: false, error: 'Internal server error' });
});

module.exports = router;
