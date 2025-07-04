console.log('🎭 Orchestrator Service (HTTP) - Starting up...');

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { verifyToken, extractTokenFromHeader } = require('../../shared/utils/jwt');
const { errorResponse } = require('../../shared/utils/response');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Service URLs
const services = {
  auth: 'http://localhost:3001',
  game: 'http://localhost:3002', 
  players: 'http://localhost:3003'
};

// Auth middleware
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json(errorResponse('Authorization required'));
    }
    const token = extractTokenFromHeader(authHeader);
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json(errorResponse('Invalid token'));
  }
};

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'orchestrator-http' });
});

app.post('/auth/register', async (req, res) => {
  try {
    const response = await axios.post(`${services.auth}/register`, req.body);
    res.json(response.data);
  } catch (error) {
    res.status(500).json(errorResponse('Auth service error'));
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const response = await axios.post(`${services.auth}/login`, req.body);
    res.json(response.data);
  } catch (error) {
    res.status(500).json(errorResponse('Auth service error'));
  }
});

app.post('/game/start', authenticateToken, async (req, res) => {
  try {
    const response = await axios.post(`${services.game}/start`, {
      playerId: req.user.userId,
      name: req.body.name || req.user.name,
      difficulty: parseInt(req.body.difficulty)
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json(errorResponse('Game service error'));
  }
});

app.listen(PORT, () => {
  console.log(`🎭 Orchestrator (HTTP) running on port ${PORT}`);
});
