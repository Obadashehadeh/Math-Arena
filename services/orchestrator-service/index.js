// services/orchestrator-service/index.js (Updated)
const express = require('express');
const cors = require('cors');
const RabbitMQConnection = require('../../shared/config/rabbitmq');
const { authenticateToken } = require('../../shared/middleware/auth');
const { validateRequest } = require('../../shared/middleware/validation');
const { securityMiddleware, authRateLimiter, gameRateLimiter } = require('../../shared/middleware/security');
const requestLogger = require('../../shared/middleware/requestLogger');
const errorHandler = require('../../shared/middleware/errorHandler');
const logger = require('../../shared/config/logger');
const { successResponse, errorResponse } = require('../../shared/utils/response');
require('dotenv').config({ path: '../../.env' });

const app = express();
const PORT = process.env.ORCHESTRATOR_PORT || 3000;

// RabbitMQ connection
let rabbitMQ;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(requestLogger('orchestrator'));
app.use(...securityMiddleware());

// Initialize connections
const initializeConnections = async () => {
    try {
        logger.info('Connecting to RabbitMQ...');
        rabbitMQ = new RabbitMQConnection();
        await rabbitMQ.connect();
        logger.info('RabbitMQ connection established');

        await rabbitMQ.setupQueues();
        logger.info('RabbitMQ queues setup completed');

        logger.info('Orchestrator Service - All connections established');
    } catch (error) {
        logger.error('Orchestrator Service - Connection failed', { error: error.message });
        process.exit(1);
    }
};

// Helper function to call microservices with circuit breaker
const callMicroservice = async (queue, method, params) => {
    try {
        const response = await rabbitMQ.sendRPC(queue, { method, params });
        return response;
    } catch (error) {
        logger.error('Microservice call failed', {
            queue,
            method,
            error: error.message,
            circuitBreakerState: rabbitMQ.getCircuitBreakerState()
        });
        throw new Error(`Service ${queue} unavailable`);
    }
};

// Health check endpoint with circuit breaker status
app.get('/health', (req, res) => {
    const circuitBreakerState = rabbitMQ ? rabbitMQ.getCircuitBreakerState() : null;

    res.json({
        status: 'healthy',
        service: 'orchestrator-service',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        circuitBreaker: circuitBreakerState
    });
});

// Circuit breaker status endpoint (for monitoring)
app.get('/circuit-breaker/status', (req, res) => {
    if (!rabbitMQ) {
        return res.status(503).json(errorResponse('RabbitMQ not connected'));
    }

    res.json(successResponse(rabbitMQ.getCircuitBreakerState()));
});

// ================================
// AUTH ROUTES
// ================================

app.post('/auth/register',
    authRateLimiter,
    validateRequest('register'),
    async (req, res) => {
        try {
            const { name, username, password } = req.body;

            logger.info('Register request', { username, ip: req.ip });

            const result = await callMicroservice('auth_queue', 'register', {
                name,
                username,
                password
            });

            const statusCode = result.success ? 201 : result.error.statusCode;

            if (result.success) {
                logger.info('User registered successfully', { username });
            } else {
                logger.warn('Registration failed', { username, error: result.error.message });
            }

            res.status(statusCode).json(result);

        } catch (error) {
            logger.error('Register error', { error: error.message, ip: req.ip });
            res.status(500).json(errorResponse('Registration service unavailable', 'SERVICE_ERROR', 500));
        }
    }
);

app.post('/auth/login',
    authRateLimiter,
    validateRequest('login'),
    async (req, res) => {
        try {
            const { username, password } = req.body;

            logger.info('Login request', { username, ip: req.ip });

            const result = await callMicroservice('auth_queue', 'login', {
                username,
                password
            });

            const statusCode = result.success ? 200 : result.error.statusCode;

            if (result.success) {
                logger.info('User logged in successfully', { username });
            } else {
                logger.warn('Login failed', { username, error: result.error.message });
            }

            res.status(statusCode).json(result);

        } catch (error) {
            logger.error('Login error', { error: error.message, ip: req.ip });
            res.status(500).json(errorResponse('Authentication service unavailable', 'SERVICE_ERROR', 500));
        }
    }
);

// ================================
// GAME ROUTES (Protected)
// ================================

app.post('/game/start',
    gameRateLimiter,
    authenticateToken,
    validateRequest('startGame'),
    async (req, res) => {
        try {
            const { name, difficulty } = req.body;
            const { userId, name: userName } = req.user;

            logger.info('Start game request', {
                playerId: userId,
                playerName: userName,
                difficulty
            });

            const result = await callMicroservice('game_queue', 'startGame', {
                playerId: userId,
                name: name || userName,
                difficulty: parseInt(difficulty)
            });

            const statusCode = result.success ? 201 : result.error.statusCode;

            if (result.success) {
                logger.info('Game started successfully', {
                    playerId: userId,
                    gameId: result.data.gameId
                });
            }

            res.status(statusCode).json(result);

        } catch (error) {
            logger.error('Start game error', {
                error: error.message,
                playerId: req.user?.userId
            });
            res.status(500).json(errorResponse('Game service unavailable', 'SERVICE_ERROR', 500));
        }
    }
);

app.post('/game/:gameId/submit',
    gameRateLimiter,
    authenticateToken,
    validateRequest('submitAnswer'),
    async (req, res) => {
        try {
            const { gameId } = req.params;
            const { answer } = req.body;
            const { userId } = req.user;

            logger.info('Submit answer request', {
                gameId,
                playerId: userId,
                answer
            });

            const result = await callMicroservice('game_queue', 'submitAnswer', {
                gameId,
                playerId: userId,
                answer: parseFloat(answer)
            });

            const statusCode = result.success ? 200 : result.error.statusCode;

            if (result.success) {
                logger.info('Answer submitted', {
                    gameId,
                    playerId: userId,
                    isCorrect: result.data.isCorrect
                });
            }

            res.status(statusCode).json(result);

        } catch (error) {
            logger.error('Submit answer error', {
                error: error.message,
                gameId: req.params.gameId,
                playerId: req.user?.userId
            });
            res.status(500).json(errorResponse('Game service unavailable', 'SERVICE_ERROR', 500));
        }
    }
);

app.put('/game/:gameId/join',
    gameRateLimiter,
    authenticateToken,
    async (req, res) => {
        try {
            const { gameId } = req.params;
            const { userId, name } = req.user;

            logger.info('Join game request', { gameId, playerId: userId, playerName: name });

            const result = await callMicroservice('game_queue', 'joinGame', {
                gameId,
                playerId: userId,
                playerName: name
            });

            const statusCode = result.success ? 200 : result.error.statusCode;

            if (result.success) {
                logger.info('Player joined game', { gameId, playerId: userId });
            }

            res.status(statusCode).json(result);

        } catch (error) {
            logger.error('Join game error', {
                error: error.message,
                gameId: req.params.gameId,
                playerId: req.user?.userId
            });
            res.status(500).json(errorResponse('Game service unavailable', 'SERVICE_ERROR', 500));
        }
    }
);

app.get('/game/:gameId/end',
    authenticateToken,
    async (req, res) => {
        try {
            const { gameId } = req.params;

            logger.info('End game request', { gameId, requestedBy: req.user.userId });

            const result = await callMicroservice('game_queue', 'endGame', {
                gameId
            });

            const statusCode = result.success ? 200 : result.error.statusCode;

            if (result.success) {
                logger.info('Game ended successfully', { gameId });
            }

            res.status(statusCode).json(result);

        } catch (error) {
            logger.error('End game error', {
                error: error.message,
                gameId: req.params.gameId,
                requestedBy: req.user?.userId
            });
            res.status(500).json(errorResponse('Game service unavailable', 'SERVICE_ERROR', 500));
        }
    }
);

// ================================
// RESULT ROUTES (Protected)
// ================================

app.get('/result/me/:gameId',
    authenticateToken,
    async (req, res) => {
        try {
            const { gameId } = req.params;
            const { userId } = req.user;

            logger.info('Get player result request', { gameId, playerId: userId });

            const result = await callMicroservice('players_queue', 'getPlayerResult', {
                gameId,
                playerId: userId
            });

            const statusCode = result.success ? 200 : result.error.statusCode;
            res.status(statusCode).json(result);

        } catch (error) {
            logger.error('Get player result error', {
                error: error.message,
                gameId: req.params.gameId,
                playerId: req.user?.userId
            });
            res.status(500).json(errorResponse('Players service unavailable', 'SERVICE_ERROR', 500));
        }
    }
);

app.get('/player/all/:gameId',
    authenticateToken,
    async (req, res) => {
        try {
            const { gameId } = req.params;

            logger.info('Get game results request', { gameId, requestedBy: req.user.userId });

            const result = await callMicroservice('players_queue', 'getGameResult', {
                gameId
            });

            const statusCode = result.success ? 200 : result.error.statusCode;
            res.status(statusCode).json(result);

        } catch (error) {
            logger.error('Get game result error', {
                error: error.message,
                gameId: req.params.gameId,
                requestedBy: req.user?.userId
            });
            res.status(500).json(errorResponse('Players service unavailable', 'SERVICE_ERROR', 500));
        }
    }
);

// ================================
// ADMIN ROUTES (Optional - for monitoring)
// ================================

app.get('/admin/stats', authenticateToken, async (req, res) => {
    try {
        // Only allow admin users (you can implement role-based access)
        const stats = {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            circuitBreaker: rabbitMQ ? rabbitMQ.getCircuitBreakerState() : null,
            timestamp: new Date().toISOString()
        };

        res.json(successResponse(stats));
    } catch (error) {
        logger.error('Admin stats error', { error: error.message });
        res.status(500).json(errorResponse('Stats unavailable'));
    }
});

// ================================
// ERROR HANDLING
// ================================

// 404 handler
app.use((req, res, next) => {
    logger.warn('Endpoint not found', {
        method: req.method,
        url: req.url,
        ip: req.ip
    });
    res.status(404).json(errorResponse('Endpoint not found', 'NOT_FOUND', 404));
});

// Global error handler
app.use(errorHandler('orchestrator'));

// ================================
// SERVER STARTUP
// ================================

const startServer = async () => {
    logger.info('Initializing connections...');
    await initializeConnections();

    logger.info('Starting Express server...');
    app.listen(PORT, () => {
        logger.info(`Orchestrator Service running on port ${PORT}`, {
            port: PORT,
            environment: process.env.NODE_ENV,
            version: '1.0.0'
        });

        console.log(`🎭 Orchestrator Service running on port ${PORT}`);
        console.log(`🔗 Health check: http://localhost:${PORT}/health`);
        console.log('📚 Available endpoints:');
        console.log('   POST /auth/register');
        console.log('   POST /auth/login');
        console.log('   POST /game/start (Protected)');
        console.log('   POST /game/:gameId/submit (Protected)');
        console.log('   PUT /game/:gameId/join (Protected)');
        console.log('   GET /game/:gameId/end (Protected)');
        console.log('   GET /result/me/:gameId (Protected)');
        console.log('   GET /player/all/:gameId (Protected)');
        console.log('   GET /circuit-breaker/status');
        console.log('🚀 Math Arena API is ready!');
    });
};

// Handle graceful shutdown
const gracefulShutdown = async (signal) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);

    if (rabbitMQ) {
        try {
            await rabbitMQ.close();
            logger.info('RabbitMQ connection closed');
        } catch (error) {
            logger.error('Error closing RabbitMQ connection', { error: error.message });
        }
    }

    process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at Promise', {
        reason: reason.toString(),
        promise: promise.toString()
    });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception', {
        error: error.message,
        stack: error.stack
    });
    process.exit(1);
});

logger.info('Starting Orchestrator Service...');
startServer();