const express = require('express');
const connectDB = require('../../shared/config/database');
const RabbitMQConnection = require('../../shared/config/rabbitmq');
const User = require('../../shared/models/User');
const { generateToken } = require('../../shared/utils/jwt');
const { successResponse, errorResponse } = require('../../shared/utils/response');
require('dotenv').config({ path: '../../.env' });

const app = express();
const PORT = process.env.AUTH_SERVICE_PORT || 3001;

// Middleware
app.use(express.json());

// RabbitMQ connection
let rabbitMQ;

// Initialize connections
const initializeConnections = async () => {
    try {
        // Connect to database
        await connectDB();

        // Connect to RabbitMQ
        rabbitMQ = new RabbitMQConnection();
        await rabbitMQ.connect();
        await rabbitMQ.setupQueues();

        // Set up RPC listener
        setupRPCListener();

        console.log('Auth Service - All connections established');
    } catch (error) {
        console.error('Auth Service - Connection failed:', error);
        process.exit(1);
    }
};

// RPC message handler
const handleRPCMessage = async (message) => {
    const { method, params } = message;

    try {
        switch (method) {
            case 'register':
                return await handleRegister(params);
            case 'login':
                return await handleLogin(params);
            default:
                return errorResponse('Unknown method', 'UNKNOWN_METHOD', 400);
        }
    } catch (error) {
        console.error('RPC Error:', error);
        return errorResponse(error.message, 'RPC_ERROR', 500);
    }
};

// Register handler
const handleRegister = async ({ name, username, password }) => {
    try {
        // Validation
        if (!name || !username || !password) {
            return errorResponse('Name, username, and password are required', 'VALIDATION_ERROR', 400);
        }

        if (password.length < 6) {
            return errorResponse('Password must be at least 6 characters', 'VALIDATION_ERROR', 400);
        }

        if (username.length < 3) {
            return errorResponse('Username must be at least 3 characters', 'VALIDATION_ERROR', 400);
        }

        // Check if user exists
        const existingUser = await User.findOne({ username: username.toLowerCase() });
        if (existingUser) {
            return errorResponse('Username already exists', 'USER_EXISTS', 409);
        }

        // Create user
        const user = new User({
            name: name.trim(),
            username: username.toLowerCase().trim(),
            password
        });

        await user.save();

        // Generate token
        const token = generateToken({
            userId: user._id,
            username: user.username,
            name: user.name
        });

        return successResponse({
            message: `Hello ${name}, your account is created`,
            access_token: token,
            user: {
                id: user._id,
                name: user.name,
                username: user.username
            }
        });

    } catch (error) {
        console.error('Register error:', error);
        return errorResponse('Registration failed', 'REGISTRATION_ERROR', 500);
    }
};

// Login handler
const handleLogin = async ({ username, password }) => {
    try {
        // Validation
        if (!username || !password) {
            return errorResponse('Username and password are required', 'VALIDATION_ERROR', 400);
        }

        // Find user
        const user = await User.findOne({ username: username.toLowerCase() });
        if (!user) {
            return errorResponse('Invalid credentials', 'INVALID_CREDENTIALS', 401);
        }

        // Check password
        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            return errorResponse('Invalid credentials', 'INVALID_CREDENTIALS', 401);
        }

        // Generate token
        const token = generateToken({
            userId: user._id,
            username: user.username,
            name: user.name
        });

        return successResponse({
            message: `Hello ${user.name}, welcome back`,
            access_token: token,
            user: {
                id: user._id,
                name: user.name,
                username: user.username
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        return errorResponse('Login failed', 'LOGIN_ERROR', 500);
    }
};

// Setup RPC listener
const setupRPCListener = () => {
    rabbitMQ.channel.consume('auth_queue', async (msg) => {
        if (msg) {
            try {
                const message = JSON.parse(msg.content.toString());
                const response = await handleRPCMessage(message);

                // Send response back
                rabbitMQ.channel.sendToQueue(
                    msg.properties.replyTo,
                    Buffer.from(JSON.stringify(response)),
                    { correlationId: msg.properties.correlationId }
                );

                rabbitMQ.channel.ack(msg);
            } catch (error) {
                console.error('Message processing error:', error);
                rabbitMQ.channel.nack(msg, false, false);
            }
        }
    });

    console.log('Auth Service - RPC listener setup complete');
};

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'auth-service',
        timestamp: new Date().toISOString()
    });
});

// Direct HTTP endpoints for testing
app.post('/register', async (req, res) => {
    try {
        const result = await handleRegister(req.body);
        res.status(result.success ? 200 : result.error.statusCode).json(result);
    } catch (error) {
        res.status(500).json(errorResponse('Internal server error'));
    }
});

app.post('/login', async (req, res) => {
    try {
        const result = await handleLogin(req.body);
        res.status(result.success ? 200 : result.error.statusCode).json(result);
    } catch (error) {
        res.status(500).json(errorResponse('Internal server error'));
    }
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Auth Service Error:', error);
    res.status(500).json(errorResponse('Internal server error'));
});

// Start server
const startServer = async () => {
    await initializeConnections();

    app.listen(PORT, () => {
        console.log(`🔐 Auth Service running on port ${PORT}`);
    });
};

// Handle graceful shutdown
process.on('SIGTERM', async () => {
    console.log('Auth Service - Shutting down gracefully...');
    if (rabbitMQ) {
        await rabbitMQ.close();
    }
    process.exit(0);
});

startServer();