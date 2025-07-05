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

        if (error.name === 'ValidationError') {
            return res.status(400).json(errorResponse('Validation error', 'VALIDATION_ERROR', 400));
        }

        if (error.name === 'MongoError' && error.code === 11000) {
            return res.status(409).json(errorResponse('Duplicate key error', 'DUPLICATE_KEY', 409));
        }

        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json(errorResponse('Invalid token', 'INVALID_TOKEN', 401));
        }

        if (error.name === 'TokenExpiredError') {
            return res.status(401).json(errorResponse('Token expired', 'TOKEN_EXPIRED', 401));
        }

        res.status(500).json(errorResponse('Internal server error', 'INTERNAL_ERROR', 500));
    };
};

module.exports = errorHandler;