/**
 * swagger.js — OpenAPI 3.0 Spec Configuration
 *
 * Mounts Swagger UI at /api/docs (dev-only).
 * Docs are generated from JSDoc @swagger annotations in route files.
 */

const path = require('path');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Animex 2.0 API',
            version: '2.0.0',
            description: 'Backend REST API for the Animex anime tracker. All /api/* endpoints (except /health) require a Bearer JWT in the Authorization header.',
        },
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                },
            },
        },
        security: [{ bearerAuth: [] }],
    },
    apis: [
        path.join(__dirname, '../routes/*.js'),
        path.join(__dirname, '../server.js'),
    ],
};

const spec = swaggerJsdoc(options);

/**
 * Mount Swagger UI on the express app (dev only).
 * @param {import('express').Application} app
 */
function mountSwagger(app) {
    if (process.env.NODE_ENV === 'production') return;
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(spec, {
        customSiteTitle: 'Animex API Docs',
        swaggerOptions: { persistAuthorization: true },
    }));
    app.get('/api/docs.json', (req, res) => res.json(spec));
}

module.exports = { mountSwagger };
