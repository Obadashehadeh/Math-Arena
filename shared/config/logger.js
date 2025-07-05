// shared/config/logger.js
const winston = require('winston');
const path = require('path');

const logFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
);

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat,
    defaultMeta: { service: process.env.SERVICE_NAME || 'math-arena' },
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

if (process.env.NODE_ENV === 'production') {
    logger.add(new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error'
    }));
    logger.add(new winston.transports.File({
        filename: 'logs/combined.log'
    }));
}

module.exports = logger;

// shared/middleware/requestLogger.js
const logger = require('../config/logger');

const requestLogger = (serviceName) => {
    return (req, res, next) => {
        const start = Date.now();

        res.on('finish', () => {
            const duration = Date.now() - start;
            logger.info('Request completed', {
                service: serviceName,
                method: req.method,
                url: req.url,
                statusCode: res.statusCode,
                duration: `${duration}ms`,
                userAgent: req.get('User-Agent'),
                ip: req.ip
            });
        });

        next();
    };
};

module.exports = requestLogger;

// shared/middleware/errorHandler.js
const logger = require('../config/logger');
const { errorResponse } = require('../utils/response');

const errorHandler = (serviceName) => {
    return (error, req, res, next) => {
        logger.error('Unhandled error', {
            service: serviceName,
            error: error.message,
            stack: error.stack,
            method: req.method,
            url: req.url,
            body: req.body,
            headers: req.headers
        });

        if (res.headersSent) {
            return next(error);
        }

        res.status(500).json(errorResponse('Internal server error', 'INTERNAL_ERROR', 500));
    };
};

module.exports = errorHandler;