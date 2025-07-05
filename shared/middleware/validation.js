// shared/middleware/validation.js
const { validationErrorResponse } = require('../utils/response');

// Input sanitization
const sanitizeInput = (obj) => {
    if (typeof obj !== 'object' || obj === null) return obj;

    const sanitized = {};
    for (const key in obj) {
        if (typeof obj[key] === 'string') {
            // Remove potential XSS characters and trim
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

// Request validation schemas
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

        // Sanitize input
        req.body = sanitizeInput(req.body);

        const errors = [];

        for (const field in schema) {
            const rules = schema[field];
            const value = req.body[field];

            // Check required fields
            if (rules.required && (value === undefined || value === null || value === '')) {
                errors.push(`${field} is required`);
                continue;
            }

            // Skip validation if field is not required and not provided
            if (!rules.required && (value === undefined || value === null)) {
                continue;
            }

            // Type validation
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
                req.body[field] = numValue; // Convert to number
            }

            // String length validation
            if (rules.type === 'string') {
                if (rules.minLength && value.length < rules.minLength) {
                    errors.push(`${field} must be at least ${rules.minLength} characters long`);
                }
                if (rules.maxLength && value.length > rules.maxLength) {
                    errors.push(`${field} must not exceed ${rules.maxLength} characters`);
                }
            }

            // Number range validation
            if (rules.type === 'number') {
                const numValue = parseFloat(value);
                if (rules.min !== undefined && numValue < rules.min) {
                    errors.push(`${field} must be at least ${rules.min}`);
                }
                if (rules.max !== undefined && numValue > rules.max) {
                    errors.push(`${field} must not exceed ${rules.max}`);
                }
            }

            // Pattern validation
            if (rules.pattern && typeof value === 'string' && !rules.pattern.test(value)) {
                errors.push(`${field} format is invalid`);
            }
        }

        if (errors.length > 0) {
            return res.status(400).json(validationErrorResponse(errors));
        }

        next();
    };
};

module.exports = {
    validateRequest,
    sanitizeInput,
    schemas
};

// shared/middleware/security.js
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

// Enhanced rate limiting
const createRateLimiter = (options = {}) => {
    return rateLimit({
        windowMs: options.windowMs || 15 * 60 * 1000, // 15 minutes
        max: options.max || 100,
        message: options.message || 'Too many requests from this IP, please try again later.',
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res) => {
            res.status(429).json({
                success: false,
                error: {
                    code: 'RATE_LIMIT_EXCEEDED',
                    message: options.message || 'Too many requests from this IP, please try again later.',
                    statusCode: 429
                },
                timestamp: new Date().toISOString()
            });
        }
    });
};

// Security middleware configuration
const securityMiddleware = () => {
    return [
        helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    scriptSrc: ["'self'"],
                    imgSrc: ["'self'", "data:", "https:"],
                },
            },
            hsts: {
                maxAge: 31536000,
                includeSubDomains: true,
                preload: true
            }
        }),
        // General rate limiter
        createRateLimiter({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 100,
            message: 'Too many requests from this IP, please try again later.'
        })
    ];
};

// Specific rate limiters
const authRateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    message: 'Too many authentication attempts, please try again later.'
});

const gameRateLimiter = createRateLimiter({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 30,
    message: 'Too many game requests, please slow down.'
});

module.exports = {
    securityMiddleware,
    authRateLimiter,
    gameRateLimiter,
    createRateLimiter
};

// shared/middleware/auth.js (Enhanced)
const { verifyToken, extractTokenFromHeader } = require('../utils/jwt');
const { errorResponse } = require('../utils/response');
const logger = require('../config/logger');

const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            logger.warn('Authentication failed: No authorization header', {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                url: req.url
            });
            return res.status(401).json(errorResponse('Authorization header required', 'NO_TOKEN', 401));
        }

        const token = extractTokenFromHeader(authHeader);
        const decoded = verifyToken(token);

        // Log successful authentication
        logger.info('User authenticated', {
            userId: decoded.userId,
            username: decoded.username,
            ip: req.ip,
            url: req.url
        });

        req.user = decoded;
        next();
    } catch (error) {
        logger.warn('Authentication failed: Invalid token', {
            error: error.message,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            url: req.url
        });
        return res.status(401).json(errorResponse('Invalid or expired token', 'INVALID_TOKEN', 401));
    }
};

// Optional authentication middleware
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (authHeader) {
            const token = extractTokenFromHeader(authHeader);
            const decoded = verifyToken(token);
            req.user = decoded;
        }
        next();
    } catch (error) {
        // Continue without authentication
        next();
    }
};

module.exports = {
    authenticateToken,
    optionalAuth
};