console.log('🎭 Orchestrator Service - Starting up...');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const RabbitMQConnection = require('../../shared/config/rabbitmq');
const { verifyToken, extractTokenFromHeader } = require('../../shared/utils/jwt');
const { successResponse, errorResponse } = require('../../shared/utils/response');
require('dotenv').config({ path: '../../.env' });

console.log('✅ All modules loaded successfully');

const app = express();
const PORT = process.env.ORCHESTRATOR_PORT || 3000;

// RabbitMQ connection
let rabbitMQ;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

app.use(limiter);

// Auth rate limiting (stricter)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // limit each IP to 5 auth requests per windowMs
    message: 'Too many authentication attempts, please try again later.',
});

// Initialize connections
const initializeConnections = async () => {
    try {
        console.log('🔄 Connecting to RabbitMQ...');
        rabbitMQ = new RabbitMQConnection();
        await rabbitMQ.connect();
        console.log('✅ RabbitMQ connection established');

        await rabbitMQ.setupQueues();
        console.log('✅ RabbitMQ queues setup');

        console.log('✅ Orchestrator Service - All connections established');
    } catch (error) {
        console.error('❌ Orchestrator Service - Connection failed:', error);
        process.exit(1);
    }
};

// Authentication middleware
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json(errorResponse('Authorization header required', 'NO_TOKEN', 401));
        }

        const token = extractTokenFromHeader(authHeader);
        const decoded = verifyToken(token);

        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json(errorResponse('Invalid or expired token', 'INVALID_TOKEN', 401));
    }
};

// Helper function to call microservices
const callMicroservice = async (queue, method, params) => {
    try {
        const response = await rabbitMQ.sendRPC(queue, { method, params });
        return response;
    } catch (error) {
        console.error(`Microservice call failed (${queue}):`, error);
        throw new Error(`Service ${queue} unavailable`);
    }
};

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'orchestrator-service',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// ================================
// AUTH ROUTES
// ================================

// Register endpoint
app.post('/auth/register', authLimiter, async (req, res) => {
    try {
        const { name, username, password } = req.body;

        console.log(`📝 Register request for username: ${username}`);

        const result = await callMicroservice('auth_queue', 'register', {
            name,
            username,
            password
        });

        const statusCode = result.success ? 201 : result.error.statusCode;
        res.status(statusCode).json(result);

    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json(errorResponse('Registration service unavailable', 'SERVICE_ERROR', 500));
    }
});

// Login endpoint
app.post('/auth/login', authLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;

        console.log(`🔐 Login request for username: ${username}`);

        const result = await callMicroservice('auth_queue', 'login', {
            username,
            password
        });

        const statusCode = result.success ? 200 : result.error.statusCode;
        res.status(statusCode).json(result);

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json(errorResponse('Authentication service unavailable', 'SERVICE_ERROR', 500));
    }
});

// ================================
// GAME ROUTES (Protected)
// ================================

// Start a new game
app.post('/game/start', authenticateToken, async (req, res) => {
    try {
        const { name, difficulty } = req.body;
        const { userId, name: userName } = req.user;

        console.log(`🎮 Start game request - Player: ${userName}, Difficulty: ${difficulty}`);

        const result = await callMicroservice('game_queue', 'startGame', {
            playerId: userId,
            name: name || userName,
            difficulty: parseInt(difficulty)
        });

        const statusCode = result.success ? 201 : result.error.statusCode;
        res.status(statusCode).json(result);

    } catch (error) {
        console.error('Start game error:', error);
        res.status(500).json(errorResponse('Game service unavailable', 'SERVICE_ERROR', 500));
    }
});

// Submit an answer
app.post('/game/:gameId/submit', authenticateToken, async (req, res) => {
    try {
        const { gameId } = req.params;
        const { answer } = req.body;
        const { userId } = req.user;

        console.log(`📝 Submit answer - Game: ${gameId}, Player: ${userId}, Answer: ${answer}`);

        const result = await callMicroservice('game_queue', 'submitAnswer', {
            gameId,
            playerId: userId,
            answer: parseFloat(answer)
        });

        const statusCode = result.success ? 200 : result.error.statusCode;
        res.status(statusCode).json(result);

    } catch (error) {
        console.error('Submit answer error:', error);
        res.status(500).json(errorResponse('Game service unavailable', 'SERVICE_ERROR', 500));
    }
});

// Join a game
app.put('/game/:gameId/join', authenticateToken, async (req, res) => {
    try {
        const { gameId } = req.params;
        const { userId, name } = req.user;

        console.log(`🚪 Join game request - Game: ${gameId}, Player: ${name}`);

        const result = await callMicroservice('game_queue', 'joinGame', {
            gameId,
            playerId: userId,
            playerName: name
        });

        const statusCode = result.success ? 200 : result.error.statusCode;
        res.status(statusCode).json(result);

    } catch (error) {
        console.error('Join game error:', error);
        res.status(500).json(errorResponse('Game service unavailable', 'SERVICE_ERROR', 500));
    }
});

// End a game
app.get('/game/:gameId/end', authenticateToken, async (req, res) => {
    try {
        const { gameId } = req.params;

        console.log(`🏁 End game request - Game: ${gameId}`);

        const result = await callMicroservice('game_queue', 'endGame', {
            gameId
        });

        const statusCode = result.success ? 200 : result.error.statusCode;
        res.status(statusCode).json(result);

    } catch (error) {
        console.error('End game error:', error);
        res.status(500).json(errorResponse('Game service unavailable', 'SERVICE_ERROR', 500));
    }
});

// ================================
// RESULT ROUTES (Protected)
// ================================

// Get player result
app.get('/result/me/:gameId', authenticateToken, async (req, res) => {
    try {
        const { gameId } = req.params;
        const { userId } = req.user;

        console.log(`📊 Get player result - Game: ${gameId}, Player: ${userId}`);

        const result = await callMicroservice('players_queue', 'getPlayerResult', {
            gameId,
            playerId: userId
        });

        const statusCode = result.success ? 200 : result.error.statusCode;
        res.status(statusCode).json(result);

    } catch (error) {
        console.error('Get player result error:', error);
        res.status(500).json(errorResponse('Players service unavailable', 'SERVICE_ERROR', 500));
    }
});

// Get game result (all players)
app.get('/player/all/:gameId', authenticateToken, async (req, res) => {
    try {
        const { gameId } = req.params;

        console.log(`🏆 Get game results - Game: ${gameId}`);

        const result = await callMicroservice('players_queue', 'getGameResult', {
            gameId
        });

        const statusCode = result.success ? 200 : result.error.statusCode;
        res.status(statusCode).json(result);

    } catch (error) {
        console.error('Get game result error:', error);
        res.status(500).json(errorResponse('Players service unavailable', 'SERVICE_ERROR', 500));
    }
});

// ================================
// ERROR HANDLING
// ================================

// 404 handler
app.use((req, res, next) => {
    res.status(404).json(errorResponse('Endpoint not found', 'NOT_FOUND', 404));
});

// Global error handler
app.use((error, req, res, next) => {
    console.error('Orchestrator Service Error:', error);
    res.status(500).json(errorResponse('Internal server error', 'INTERNAL_ERROR', 500));
});

// ================================
// SERVER STARTUP
// ================================

// Start server
const startServer = async () => {
    console.log('🔄 Initializing connections...');
    await initializeConnections();

    console.log('🔄 Starting Express server...');
    app.listen(PORT, () => {
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
        console.log('🚀 Math Arena API is ready!');
    });
};

// Handle graceful shutdown
process.on('SIGTERM', async () => {
    console.log('Orchestrator Service - Shutting down gracefully...');
    if (rabbitMQ) {
        await rabbitMQ.close();
    }
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('\nOrchestrator Service - Shutting down gracefully...');
    if (rabbitMQ) {
        await rabbitMQ.close();
    }
    process.exit(0);
});

console.log('🚀 Starting Orchestrator Service...');
startServer();