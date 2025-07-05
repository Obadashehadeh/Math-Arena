const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { verifyToken } = require('../../shared/utils/jwt');
const { errorResponse } = require('../../shared/utils/response');

const app = express();
app.use(cors());
app.use(express.json());

// Auth middleware
const authenticateToken = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json(errorResponse('Authorization required'));
        }

        const token = authHeader.substring(7);
        const decoded = verifyToken(token);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json(errorResponse('Invalid token'));
    }
};

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', service: 'orchestrator-simple' });
});

// Auth routes
app.post('/auth/register', async (req, res) => {
    try {
        console.log('Forwarding register request...');
        const response = await axios.post('http://localhost:3001/register', req.body);
        res.json(response.data);
    } catch (error) {
        console.error('Register error:', error.message);
        if (error.response) {
            res.status(error.response.status).json(error.response.data);
        } else {
            res.status(500).json(errorResponse('Auth service unavailable'));
        }
    }
});

app.post('/auth/login', async (req, res) => {
    try {
        console.log('Forwarding login request...');
        const response = await axios.post('http://localhost:3001/login', req.body);
        res.json(response.data);
    } catch (error) {
        console.error('Login error:', error.message);
        if (error.response) {
            res.status(error.response.status).json(error.response.data);
        } else {
            res.status(500).json(errorResponse('Auth service unavailable'));
        }
    }
});

// Simple game routes (mock for now)
app.post('/game/start', authenticateToken, (req, res) => {
    const { name, difficulty } = req.body;
    const gameId = Math.random().toString(36).substring(2, 15);

    console.log('Starting game:', { player: req.user.name, difficulty });

    res.json({
        success: true,
        data: {
            message: `Hello ${name || req.user.name}, find your submit API URL below`,
            submit_url: `/game/${gameId}/submit`,
            question: difficulty === 1 ? "5 + 3" : "12 * 7 + 23",
            time_started: new Date(),
            gameId: gameId
        }
    });
});

app.post('/game/:gameId/submit', authenticateToken, (req, res) => {
    const { gameId } = req.params;
    const { answer } = req.body;

    console.log('Answer submitted:', { gameId, answer, player: req.user.name });

    // Simple answer checking (just for demo)
    const isCorrect = Math.random() > 0.5; // Random for demo

    res.json({
        success: true,
        data: {
            result: isCorrect ?
                `Good job ${req.user.name}, your answer is correct!` :
                `Sorry ${req.user.name}, your answer is incorrect.`,
            time_taken: Math.floor(Math.random() * 10) + 1,
            next_question: {
                submit_url: `/game/${gameId}/submit`,
                question: "15 - 7"
            },
            current_score: 0.75,
            isCorrect: isCorrect
        }
    });
});

app.listen(3000, () => {
    console.log('🎭 Simple Orchestrator running on port 3000');
    console.log('📚 Available endpoints:');
    console.log('   POST /auth/register');
    console.log('   POST /auth/login');
    console.log('   POST /game/start (Protected)');
    console.log('   POST /game/:gameId/submit (Protected)');
    console.log('🚀 Ready for testing!');
});