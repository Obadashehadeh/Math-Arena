console.log('🎮 Game Service - Starting up...');

const express = require('express');
const connectDB = require('../../shared/config/database');
const RabbitMQConnection = require('../../shared/config/rabbitmq');
const Game = require('../../shared/models/Game');
const GameSession = require('../../shared/models/GameSession');
const { generateMathEquation, validateAnswer } = require('../../shared/utils/mathGenerator');
const { successResponse, errorResponse } = require('../../shared/utils/response');
require('dotenv').config({ path: '../../.env' });

console.log('✅ All modules loaded successfully');

const app = express();
const PORT = process.env.GAME_SERVICE_PORT || 3002;

// Middleware
app.use(express.json());

// RabbitMQ connection
let rabbitMQ;

// Initialize connections
const initializeConnections = async () => {
    try {
        console.log('🔄 Connecting to database...');
        await connectDB();
        console.log('✅ Database connected');

        console.log('🔄 Connecting to RabbitMQ...');
        rabbitMQ = new RabbitMQConnection();
        await rabbitMQ.connect();
        console.log('✅ RabbitMQ connection established');

        await rabbitMQ.setupQueues();
        console.log('✅ RabbitMQ queues setup');

        setupRPCListener();
        console.log('✅ RPC listener setup');

        console.log('✅ Game Service - All connections established');
    } catch (error) {
        console.error('❌ Game Service - Connection failed:', error);
        process.exit(1);
    }
};

// RPC message handler
const handleRPCMessage = async (message) => {
    const { method, params } = message;

    try {
        switch (method) {
            case 'startGame':
                return await handleStartGame(params);
            case 'submitAnswer':
                return await handleSubmitAnswer(params);
            case 'joinGame':
                return await handleJoinGame(params);
            case 'endGame':
                return await handleEndGame(params);
            default:
                return errorResponse('Unknown method', 'UNKNOWN_METHOD', 400);
        }
    } catch (error) {
        console.error('Game RPC Error:', error);
        return errorResponse(error.message, 'RPC_ERROR', 500);
    }
};

// Start Game handler
const handleStartGame = async ({ playerId, name, difficulty }) => {
    try {
        // Validation
        if (!playerId || !name || !difficulty) {
            return errorResponse('Player ID, name, and difficulty are required', 'VALIDATION_ERROR', 400);
        }

        if (difficulty < 1 || difficulty > 4) {
            return errorResponse('Difficulty must be between 1 and 4', 'VALIDATION_ERROR', 400);
        }

        // Generate first question
        const firstQuestion = generateMathEquation(difficulty);

        // Create new game
        const game = new Game({
            difficulty,
            players: [playerId],
            questions: [firstQuestion],
            createdBy: playerId,
            status: 'active'
        });

        await game.save();

        // Create game session for the player
        const gameSession = new GameSession({
            gameId: game._id,
            playerId,
            playerName: name,
            currentQuestionIndex: 0,
            lastAnswerTime: new Date()
        });

        await gameSession.save();

        return successResponse({
            message: `Hello ${name}, find your submit API URL below`,
            submit_url: `/game/${game._id}/submit`,
            question: firstQuestion.equation,
            time_started: game.createdAt,
            gameId: game._id
        });

    } catch (error) {
        console.error('Start game error:', error);
        return errorResponse('Failed to start game', 'START_GAME_ERROR', 500);
    }
};

// Submit Answer handler
const handleSubmitAnswer = async ({ gameId, playerId, answer }) => {
    try {
        // Validation
        if (!gameId || !playerId || answer === undefined) {
            return errorResponse('Game ID, player ID, and answer are required', 'VALIDATION_ERROR', 400);
        }

        // Find game and session
        const game = await Game.findById(gameId);
        if (!game) {
            return errorResponse('Game not found', 'GAME_NOT_FOUND', 404);
        }

        if (game.status === 'ended') {
            return errorResponse('Game has ended', 'GAME_ENDED', 400);
        }

        const gameSession = await GameSession.findOne({ gameId, playerId });
        if (!gameSession) {
            return errorResponse('Player not in game', 'PLAYER_NOT_IN_GAME', 400);
        }

        // Get current question
        const currentQuestionIndex = gameSession.currentQuestionIndex;
        const currentQuestion = game.questions[currentQuestionIndex];

        if (!currentQuestion) {
            return errorResponse('No question available', 'NO_QUESTION', 400);
        }

        // Calculate time taken
        const now = new Date();
        const timeTaken = Math.round((now - gameSession.lastAnswerTime) / 1000);

        // Validate answer
        const isCorrect = validateAnswer(answer, currentQuestion.answer);

        // Save answer
        gameSession.answers.push({
            questionIndex: currentQuestionIndex,
            submittedAnswer: parseFloat(answer),
            isCorrect,
            timeTaken,
            submittedAt: now
        });

        // Update scores
        if (isCorrect) {
            gameSession.totalScore += 1;
        }
        gameSession.totalTime += timeTaken;

        // Generate next question
        const nextQuestion = generateMathEquation(game.difficulty);
        game.questions.push(nextQuestion);

        // Update session for next question
        gameSession.currentQuestionIndex += 1;
        gameSession.lastAnswerTime = now;

        // Save updates
        await game.save();
        await gameSession.save();

        // Prepare response
        const resultMessage = isCorrect ?
            `Good job ${gameSession.playerName}, your answer is correct!` :
            `Sorry ${gameSession.playerName}, your answer is incorrect.`;

        const currentScore = gameSession.answers.length > 0 ?
            (gameSession.totalScore / gameSession.answers.length) : 0;

        return successResponse({
            result: resultMessage,
            time_taken: timeTaken,
            next_question: {
                submit_url: `/game/${gameId}/submit`,
                question: nextQuestion.equation
            },
            current_score: Math.round(currentScore * 100) / 100,
            isCorrect,
            correctAnswer: currentQuestion.answer
        });

    } catch (error) {
        console.error('Submit answer error:', error);
        return errorResponse('Failed to submit answer', 'SUBMIT_ANSWER_ERROR', 500);
    }
};

// Join Game handler
const handleJoinGame = async ({ gameId, playerId, playerName }) => {
    try {
        // Validation
        if (!gameId || !playerId || !playerName) {
            return errorResponse('Game ID, player ID, and player name are required', 'VALIDATION_ERROR', 400);
        }

        // Find game
        const game = await Game.findById(gameId);
        if (!game) {
            return errorResponse('Game not found', 'GAME_NOT_FOUND', 404);
        }

        if (game.status === 'ended') {
            return errorResponse(`Sorry ${playerName}, game ended or already joined.`, 'GAME_ENDED', 400);
        }

        // Check if player already joined
        const existingSession = await GameSession.findOne({ gameId, playerId });
        if (existingSession) {
            return errorResponse(`Sorry ${playerName}, game ended or already joined.`, 'ALREADY_JOINED', 400);
        }

        // Add player to game
        if (!game.players.includes(playerId)) {
            game.players.push(playerId);
            await game.save();
        }

        // Create game session for new player
        const gameSession = new GameSession({
            gameId,
            playerId,
            playerName,
            currentQuestionIndex: 0,
            lastAnswerTime: new Date()
        });

        await gameSession.save();

        // Get current question (first question for new player)
        const currentQuestion = game.questions[0];

        return successResponse({
            result: `Welcome ${playerName}, now you can participate!`,
            next_question: {
                submit_url: `/game/${gameId}/submit`,
                question: currentQuestion.equation
            }
        });

    } catch (error) {
        console.error('Join game error:', error);
        return errorResponse('Failed to join game', 'JOIN_GAME_ERROR', 500);
    }
};

// End Game handler
const handleEndGame = async ({ gameId }) => {
    try {
        // Validation
        if (!gameId) {
            return errorResponse('Game ID is required', 'VALIDATION_ERROR', 400);
        }

        // Find and update game
        const game = await Game.findByIdAndUpdate(
            gameId,
            {
                status: 'ended',
                endedAt: new Date()
            },
            { new: true }
        );

        if (!game) {
            return errorResponse('Game not found', 'GAME_NOT_FOUND', 404);
        }

        return successResponse({
            message: 'Game ended successfully'
        });

    } catch (error) {
        console.error('End game error:', error);
        return errorResponse('Failed to end game', 'END_GAME_ERROR', 500);
    }
};

// Setup RPC listener
const setupRPCListener = () => {
    rabbitMQ.channel.consume('game_queue', async (msg) => {
        if (msg) {
            try {
                const message = JSON.parse(msg.content.toString());
                const response = await handleRPCMessage(message);

                rabbitMQ.channel.sendToQueue(
                    msg.properties.replyTo,
                    Buffer.from(JSON.stringify(response)),
                    { correlationId: msg.properties.correlationId }
                );

                rabbitMQ.channel.ack(msg);
            } catch (error) {
                console.error('Game message processing error:', error);
                rabbitMQ.channel.nack(msg, false, false);
            }
        }
    });

    console.log('Game Service - RPC listener setup complete');
};

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'game-service',
        timestamp: new Date().toISOString()
    });
});

// Direct HTTP endpoints for testing
app.post('/start', async (req, res) => {
    try {
        const result = await handleStartGame(req.body);
        res.status(result.success ? 200 : result.error.statusCode).json(result);
    } catch (error) {
        res.status(500).json(errorResponse('Internal server error'));
    }
});

app.post('/:gameId/submit', async (req, res) => {
    try {
        const result = await handleSubmitAnswer({
            gameId: req.params.gameId,
            ...req.body
        });
        res.status(result.success ? 200 : result.error.statusCode).json(result);
    } catch (error) {
        res.status(500).json(errorResponse('Internal server error'));
    }
});

app.put('/:gameId/join', async (req, res) => {
    try {
        const result = await handleJoinGame({
            gameId: req.params.gameId,
            ...req.body
        });
        res.status(result.success ? 200 : result.error.statusCode).json(result);
    } catch (error) {
        res.status(500).json(errorResponse('Internal server error'));
    }
});

app.get('/:gameId/end', async (req, res) => {
    try {
        const result = await handleEndGame({
            gameId: req.params.gameId
        });
        res.status(result.success ? 200 : result.error.statusCode).json(result);
    } catch (error) {
        res.status(500).json(errorResponse('Internal server error'));
    }
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Game Service Error:', error);
    res.status(500).json(errorResponse('Internal server error'));
});

// Start server
const startServer = async () => {
    await initializeConnections();

    app.listen(PORT, () => {
        console.log(`🎮 Game Service running on port ${PORT}`);
    });
};

// Handle graceful shutdown
process.on('SIGTERM', async () => {
    console.log('Game Service - Shutting down gracefully...');
    if (rabbitMQ) {
        await rabbitMQ.close();
    }
    process.exit(0);
});

startServer();