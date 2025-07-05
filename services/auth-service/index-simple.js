const express = require('express');
const User = require('../../shared/models/User');
const { generateToken } = require('../../shared/utils/jwt');
const { successResponse, errorResponse } = require('../../shared/utils/response');
require('dotenv').config({ path: '../../.env' });

const app = express();
app.use(express.json());

// Simple MongoDB connection
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/math-arena')
    .then(() => console.log('✅ MongoDB connected'))
    .catch(err => console.log('❌ MongoDB failed:', err.message));

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', service: 'auth-simple' });
});

app.post('/register', async (req, res) => {
    try {
        const { name, username, password } = req.body;
        console.log('Register request:', { name, username });

        // Check if user exists
        const existingUser = await User.findOne({ username: username.toLowerCase() });
        if (existingUser) {
            return res.status(409).json(errorResponse('Username already exists', 'USER_EXISTS', 409));
        }

        const user = new User({ name, username, password });
        await user.save();

        const token = generateToken({ userId: user._id, username, name });

        res.status(201).json(successResponse({
            message: `Hello ${name}, your account is created`,
            access_token: token,
            user: { id: user._id, name: user.name, username: user.username }
        }));
    } catch (error) {
        console.error('Register error:', error.message);
        res.status(500).json(errorResponse('Registration failed'));
    }
});

app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        console.log('Login request:', { username });

        const user = await User.findOne({ username: username.toLowerCase() });
        if (!user) {
            return res.status(401).json(errorResponse('Invalid credentials', 'INVALID_CREDENTIALS', 401));
        }

        const isValid = await user.comparePassword(password);
        if (!isValid) {
            return res.status(401).json(errorResponse('Invalid credentials', 'INVALID_CREDENTIALS', 401));
        }

        const token = generateToken({ userId: user._id, username: user.username, name: user.name });

        res.status(200).json(successResponse({
            message: `Hello ${user.name}, welcome back`,
            access_token: token,
            user: { id: user._id, name: user.name, username: user.username }
        }));
    } catch (error) {
        console.error('Login error:', error.message);
        res.status(500).json(errorResponse('Login failed'));
    }
});

app.listen(3001, () => {
    console.log('🔐 Simple Auth Service running on port 3001');
});