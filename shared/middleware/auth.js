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
        next();
    }
};

module.exports = {
    authenticateToken,
    optionalAuth
};