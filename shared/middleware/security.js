const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const createRateLimiter = (options = {}) => {
    return rateLimit({
        windowMs: options.windowMs || 15 * 60 * 1000,
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
        createRateLimiter({
            windowMs: 15 * 60 * 1000,
            max: 100,
            message: 'Too many requests from this IP, please try again later.'
        })
    ];
};

const authRateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Too many authentication attempts, please try again later.'
});

const gameRateLimiter = createRateLimiter({
    windowMs: 1 * 60 * 1000,
    max: 30,
    message: 'Too many game requests, please slow down.'
});

module.exports = {
    securityMiddleware,
    authRateLimiter,
    gameRateLimiter,
    createRateLimiter
};