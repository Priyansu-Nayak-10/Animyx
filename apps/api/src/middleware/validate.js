/**
 * validate.js — Lightweight Request Validation Middleware
 *
 * Usage:
 *   router.post('/route', validate({ body: rules, query: rules }), handler);
 *
 * Rule format per field:
 *   { type: 'string'|'number'|'boolean', required: bool, min: num, max: num, enum: [...] }
 */

const { apiError } = require('../utils');

/**
 * Coerce and validate a single value against a rule.
 * Returns { value, error } where error is a string message or null.
 */
function validateField(raw, rule, fieldName) {
    // Missing check
    if (raw === undefined || raw === null || raw === '') {
        if (rule.required) return { value: null, error: `"${fieldName}" is required` };
        return { value: undefined, error: null };
    }

    let value = raw;

    // Type coercion + check
    if (rule.type === 'number') {
        value = Number(raw);
        if (!Number.isFinite(value)) return { value: null, error: `"${fieldName}" must be a number` };
        if (rule.min !== undefined && value < rule.min) return { value: null, error: `"${fieldName}" must be >= ${rule.min}` };
        if (rule.max !== undefined && value > rule.max) return { value: null, error: `"${fieldName}" must be <= ${rule.max}` };
    } else if (rule.type === 'string') {
        value = String(raw);
        if (rule.minLength !== undefined && value.length < rule.minLength) {
            return { value: null, error: `"${fieldName}" must be at least ${rule.minLength} characters` };
        }
        if (rule.maxLength !== undefined && value.length > rule.maxLength) {
            return { value: null, error: `"${fieldName}" must be at most ${rule.maxLength} characters` };
        }
    } else if (rule.type === 'boolean') {
        value = raw === true || raw === 'true' || raw === '1';
    }

    // Enum check
    if (Array.isArray(rule.enum) && !rule.enum.includes(value)) {
        return { value: null, error: `"${fieldName}" must be one of: ${rule.enum.join(', ')}` };
    }

    return { value, error: null };
}

/**
 * Validate a source object (body or query) against a rules map.
 * Returns an array of error strings.
 */
function validateSource(source, rules) {
    const errors = [];
    for (const [fieldName, rule] of Object.entries(rules)) {
        const { error } = validateField(source[fieldName], rule, fieldName);
        if (error) errors.push(error);
    }
    return errors;
}

/**
 * Middleware factory.
 * @param {{ body?: Record<string, object>, query?: Record<string, object> }} schema
 */
function validate(schema = {}) {
    return function validationMiddleware(req, res, next) {
        const errors = [];

        if (schema.body) {
            errors.push(...validateSource(req.body || {}, schema.body));
        }
        if (schema.query) {
            errors.push(...validateSource(req.query || {}, schema.query));
        }

        if (errors.length > 0) {
            return apiError(res, errors[0], 400);
        }

        return next();
    };
}

module.exports = { validate, validateField, validateSource };
