const logger = require('../config/logger');

const requestLogger = (serviceName) => {
    return (req, res, next) => {
        const start = Date.now();

        logger.info('Incoming request', {
            service: serviceName,
            method: req.method,
            url: req.url,
            userAgent: req.get('User-Agent'),
            ip: req.ip,
            timestamp: new Date().toISOString()
        });

        res.on('finish', () => {
            const duration = Date.now() - start;
            const logLevel = res.statusCode >= 400 ? 'warn' : 'info';

            logger[logLevel]('Request completed', {
                service: serviceName,
                method: req.method,
                url: req.url,
                statusCode: res.statusCode,
                duration: `${duration}ms`,
                userAgent: req.get('User-Agent'),
                ip: req.ip,
                contentLength: res.get('content-length') || 0
            });
        });

        next();
    };
};

module.exports = requestLogger;