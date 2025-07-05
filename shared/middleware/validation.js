const { errorResponse } = require('../utils/response');

const sanitizeInput = (obj) => {
    if (typeof obj !== 'object' || obj === null) return obj;

    const sanitized = {};
    for (const key in obj) {
        if (typeof obj[key] === 'string') {
            sanitized[key] = obj[key]
                .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                .replace(/javascript:/gi, '')
                .trim();
        } else if (typeof obj[key] === 'object') {
            sanitized[key] = sanitizeInput(obj[key]);
        } else {
            sanitized[key] = obj[key];
        }
    }
    return sanitized;
};

const schemas = {
    register: {
        name: { required: true, type: 'string', minLength: 1, maxLength: 50 },
        username: { required: true, type: 'string', minLength: 3, maxLength: 20, pattern: /^[a-zA-Z0-9_]+$/ },
        password: { required: true, type: 'string', minLength: 6, maxLength: 100 }
    },
    login: {
        username: { required: true, type: 'string', minLength: 3, maxLength: 20 },
        password: { required: true, type: 'string', minLength: 6, maxLength: 100 }
    },
    startGame: {
        name: { required: false, type: 'string', maxLength: 50 },
        difficulty: { required: true, type: 'number', min: 1, max: 4 }
    },
    submitAnswer: {
        answer: { required: true, type: 'number' }
    }
};

const validateRequest = (schemaName) => {
    return (req, res, next) => {
        const schema = schemas[schemaName];
        if (!schema) {
            return next();
        }

        req.body = sanitizeInput(req.body);

        const errors = [];

        for (const field in schema) {
            const rules = schema[field];
            const value = req.body[field];

            if (rules.required && (value === undefined || value === null || value === '')) {
                errors.push(`${field} is required`);
                continue;
            }

            if (!rules.required && (value === undefined || value === null)) {
                continue;
            }

            if (rules.type === 'string' && typeof value !== 'string') {
                errors.push(`${field} must be a string`);
                continue;
            }

            if (rules.type === 'number') {
                const numValue = parseFloat(value);
                if (isNaN(numValue)) {
                    errors.push(`${field} must be a valid number`);
                    continue;
                }
                req.body[field] = numValue;
            }

            if (rules.type === 'string') {
                if (rules.minLength && value.length < rules.minLength) {
                    errors.push(`${field} must be at least ${rules.minLength} characters long`);
                }
                if (rules.maxLength && value.length > rules.maxLength) {
                    errors.push(`${field} must not exceed ${rules.maxLength} characters`);
                }
            }

            if (rules.type === 'number') {
                const numValue = parseFloat(value);
                if (rules.min !== undefined && numValue < rules.min) {
                    errors.push(`${field} must be at least ${rules.min}`);
                }
                if (rules.max !== undefined && numValue > rules.max) {
                    errors.push(`${field} must not exceed ${rules.max}`);
                }
            }

            if (rules.pattern && typeof value === 'string' && !rules.pattern.test(value)) {
                errors.push(`${field} format is invalid`);
            }
        }

        if (errors.length > 0) {
            return res.status(400).json(errorResponse('Validation failed', 'VALIDATION_ERROR', 400, errors));
        }

        next();
    };
};

const validationErrorResponse = (errors) => {
    return {
        success: false,
        error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            details: errors,
            statusCode: 400
        },
        timestamp: new Date().toISOString()
    };
};

module.exports = {
    validateRequest,
    sanitizeInput,
    schemas,
    validationErrorResponse
};