console.log('👥 Players Service - Starting up...');

const express = require('express');
const connectDB = require('../../shared/config/database');
const RabbitMQConnection = require('../../shared/config/rabbitmq');
const Game = require('../../shared/models/Game');
const GameSession = require('../../shared/models/GameSession');
const User = require('../../shared/models/User');
const { successResponse, errorResponse } = require('../../shared/utils/response');
require('dotenv').config({ path: '../../.env' });

console.log('✅ All modules loaded successfully');

const app = express();
const PORT = process.env.PLAYERS_SERVICE_PORT || 3003;

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

        console.log('✅ Players Service - All connections established');
    } catch (error) {
        console.error('❌ Players Service - Connection failed:', error);
        process.exit(1);
    }
};

// RPC message handler
const handleRPCMessage = async (message) => {
    const { method, params } = message;

    try {
        switch (method) {
            case 'getPlayerResult':
                return await handleGetPlayerResult(params);
            case 'getGameResult':
                return await handleGetGameResult(params);
            default:
                return errorResponse('Unknown method', 'UNKNOWN_METHOD', 400);
        }
    } catch (error) {
        console.error('Players RPC Error:', error);
        return errorResponse(error.message, 'RPC_ERROR', 500);
    }
};

// Get Player Result handler
const handleGetPlayerResult = async ({ gameId, playerId }) => {
    try {
        // Validation
        if (!gameId || !playerId) {
            return errorResponse('Game ID and player ID are required', 'VALIDATION_ERROR', 400);
        }

        // Find game and session
        const game = await Game.findById(gameId);
        if (!game) {
            return errorResponse('Game not found', 'GAME_NOT_FOUND', 404);
        }

        const gameSession = await GameSession.findOne({ gameId, playerId }).populate('playerId', 'name');
        if (!gameSession) {
            return errorResponse('Player session not found', 'SESSION_NOT_FOUND', 404);
        }

        // Calculate current score
        const currentScore = gameSession.answers.length > 0 ?
            (gameSession.totalScore / gameSession.answers.length) : 0;

        // Find best answer (fastest correct answer)
        const correctAnswers = gameSession.answers.filter(answer => answer.isCorrect);
        let bestScore = null;

        if (correctAnswers.length > 0) {
            const fastestAnswer = correctAnswers.reduce((best, current) =>
                current.timeTaken < best.timeTaken ? current : best
            );

            const bestQuestion = game.questions[fastestAnswer.questionIndex];
            bestScore = {
                question: bestQuestion.equation,
                answer: bestQuestion.answer,
                time_taken: fastestAnswer.timeTaken
            };
        }

        // Build history
        const history = gameSession.answers.map((answer, index) => {
            const question = game.questions[answer.questionIndex];
            return {
                question: question ? question.equation : 'Question not found',
                submitted_answer: answer.submittedAnswer,
                correct_answer: question ? question.answer : null,
                is_correct: answer.isCorrect,
                time_taken: answer.timeTaken,
                submitted_at: answer.submittedAt
            };
        });

        return successResponse({
            name: gameSession.playerName,
            difficulty: game.difficulty,
            current_score: Math.round(currentScore * 100) / 100,
            total_time_spent: gameSession.totalTime,
            best_score: bestScore,
            history: history,
            total_questions: gameSession.answers.length,
            correct_answers: gameSession.totalScore
        });

    } catch (error) {
        console.error('Get player result error:', error);
        return errorResponse('Failed to get player result', 'GET_PLAYER_RESULT_ERROR', 500);
    }
};

// Get Game Result handler
const handleGetGameResult = async ({ gameId }) => {
    try {
        // Validation
        if (!gameId) {
            return errorResponse('Game ID is required', 'VALIDATION_ERROR', 400);
        }

        // Find game
        const game = await Game.findById(gameId);
        if (!game) {
            return errorResponse('Game not found', 'GAME_NOT_FOUND', 404);
        }

        // Find all sessions for this game
        const gameSessions = await GameSession.find({ gameId }).populate('playerId', 'name');

        if (gameSessions.length === 0) {
            return successResponse({
                difficulty: game.difficulty,
                winners: [],
                best_score: null,
                scores: []
            });
        }

        // Calculate scores for all players
        const playerScores = gameSessions.map(session => {
            const scorePercentage = session.answers.length > 0 ?
                (session.totalScore / session.answers.length) : 0;

            return {
                player: session.playerName,
                playerId: session.playerId,
                score: Math.round(scorePercentage * 100) / 100,
                correct_answers: session.totalScore,
                total_questions: session.answers.length,
                total_time: session.totalTime,
                avg_time_per_question: session.answers.length > 0 ?
                    Math.round(session.totalTime / session.answers.length * 100) / 100 : 0
            };
        });

        // Sort by score (descending), then by total time (ascending)
        playerScores.sort((a, b) => {
            if (b.score !== a.score) {
                return b.score - a.score; // Higher score first
            }
            return a.total_time - b.total_time; // Lower time first for tie-breaker
        });

        // Find winners (players with highest score and lowest time)
        const topScore = playerScores[0]?.score || 0;
        const winners = playerScores.filter(player => player.score === topScore);

        // Find overall best answer (fastest correct answer across all players)
        let globalBestScore = null;
        let fastestTime = Infinity;

        for (const session of gameSessions) {
            const correctAnswers = session.answers.filter(answer => answer.isCorrect);

            for (const answer of correctAnswers) {
                if (answer.timeTaken < fastestTime) {
                    fastestTime = answer.timeTaken;
                    const question = game.questions[answer.questionIndex];

                    globalBestScore = {
                        player: session.playerName,
                        question: question.equation,
                        answer: question.answer,
                        time_taken: answer.timeTaken
                    };
                }
            }
        }

        return successResponse({
            difficulty: game.difficulty,
            winners: winners.map(w => ({
                player: w.player,
                score: w.score,
                total_time: w.total_time
            })),
            best_score: globalBestScore,
            scores: playerScores,
            game_status: game.status,
            total_players: gameSessions.length,
            total_questions: game.questions.length
        });

    } catch (error) {
        console.error('Get game result error:', error);
        return errorResponse('Failed to get game result', 'GET_GAME_RESULT_ERROR', 500);
    }
};

// Setup RPC listener
const setupRPCListener = () => {
    rabbitMQ.channel.consume('players_queue', async (msg) => {
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
                console.error('Players message processing error:', error);
                rabbitMQ.channel.nack(msg, false, false);
            }
        }
    });

    console.log('Players Service - RPC listener setup complete');
};

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'players-service',
        timestamp: new Date().toISOString()
    });
});

// Direct HTTP endpoints for testing
app.get('/result/:gameId/:playerId', async (req, res) => {
    try {
        const result = await handleGetPlayerResult({
            gameId: req.params.gameId,
            playerId: req.params.playerId
        });
        res.status(result.success ? 200 : result.error.statusCode).json(result);
    } catch (error) {
        res.status(500).json(errorResponse('Internal server error'));
    }
});

app.get('/game/:gameId/results', async (req, res) => {
    try {
        const result = await handleGetGameResult({
            gameId: req.params.gameId
        });
        res.status(result.success ? 200 : result.error.statusCode).json(result);
    } catch (error) {
        res.status(500).json(errorResponse('Internal server error'));
    }
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Players Service Error:', error);
    res.status(500).json(errorResponse('Internal server error'));
});

// Start server
const startServer = async () => {
    console.log('🔄 Initializing connections...');
    await initializeConnections();

    console.log('🔄 Starting Express server...');
    app.listen(PORT, () => {
        console.log(`👥 Players Service running on port ${PORT}`);
        console.log(`🔗 Health check: http://localhost:${PORT}/health`);
    });
};

// Handle graceful shutdown
process.on('SIGTERM', async () => {
    console.log('Players Service - Shutting down gracefully...');
    if (rabbitMQ) {
        await rabbitMQ.close();
    }
    process.exit(0);
});

console.log('🚀 Starting Players Service...');
startServer();