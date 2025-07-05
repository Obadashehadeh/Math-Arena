// jest.config.js
module.exports = {
    testEnvironment: 'node',
    collectCoverageFrom: [
        'services/**/*.js',
        'shared/**/*.js',
        '!**/node_modules/**',
        '!**/coverage/**'
    ],
    testMatch: [
        '**/tests/**/*.test.js'
    ],
    setupFilesAfterEnv: ['<rootDir>/tests/setup.js']
};

// tests/setup.js
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    process.env.MONGODB_URI = mongoUri;
    process.env.JWT_SECRET = 'test-secret-key';
});

afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
        await mongoose.connection.close();
    }
    if (mongoServer) {
        await mongoServer.stop();
    }
});

beforeEach(async () => {
    if (mongoose.connection.readyState !== 0) {
        const collections = mongoose.connection.collections;
        for (const key in collections) {
            await collections[key].deleteMany({});
        }
    }
});

// tests/auth.test.js
const request = require('supertest');
const express = require('express');
const connectDB = require('../shared/config/database');
const User = require('../shared/models/User');
const { generateToken } = require('../shared/utils/jwt');

const app = express();
app.use(express.json());

// Mock auth handlers
const { handleRegister, handleLogin } = require('./mocks/authHandlers');
app.post('/register', async (req, res) => {
    const result = await handleRegister(req.body);
    res.status(result.success ? 201 : result.error.statusCode).json(result);
});

app.post('/login', async (req, res) => {
    const result = await handleLogin(req.body);
    res.status(result.success ? 200 : result.error.statusCode).json(result);
});

describe('Auth Service', () => {
    beforeAll(async () => {
        await connectDB();
    });

    describe('POST /register', () => {
        it('should register a new user successfully', async () => {
            const userData = {
                name: 'Test User',
                username: 'testuser',
                password: 'password123'
            };

            const response = await request(app)
                .post('/register')
                .send(userData)
                .expect(201);

            expect(response.body.success).toBe(true);
            expect(response.body.data.access_token).toBeDefined();
            expect(response.body.data.user.username).toBe(userData.username);
        });

        it('should fail with invalid data', async () => {
            const response = await request(app)
                .post('/register')
                .send({
                    name: 'Test User'
                    // Missing username and password
                })
                .expect(400);

            expect(response.body.success).toBe(false);
        });

        it('should fail with duplicate username', async () => {
            const userData = {
                name: 'Test User',
                username: 'testuser',
                password: 'password123'
            };

            // Create first user
            await request(app).post('/register').send(userData);

            // Try to create duplicate
            const response = await request(app)
                .post('/register')
                .send(userData)
                .expect(409);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('USER_EXISTS');
        });
    });

    describe('POST /login', () => {
        beforeEach(async () => {
            // Create a test user
            const user = new User({
                name: 'Test User',
                username: 'testuser',
                password: 'password123'
            });
            await user.save();
        });

        it('should login successfully with valid credentials', async () => {
            const response = await request(app)
                .post('/login')
                .send({
                    username: 'testuser',
                    password: 'password123'
                })
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.access_token).toBeDefined();
        });

        it('should fail with invalid credentials', async () => {
            const response = await request(app)
                .post('/login')
                .send({
                    username: 'testuser',
                    password: 'wrongpassword'
                })
                .expect(401);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
        });
    });
});

// tests/mocks/authHandlers.js
const User = require('../../shared/models/User');
const { generateToken } = require('../../shared/utils/jwt');
const { successResponse, errorResponse } = require('../../shared/utils/response');

const handleRegister = async ({ name, username, password }) => {
    try {
        if (!name || !username || !password) {
            return errorResponse('Name, username, and password are required', 'VALIDATION_ERROR', 400);
        }

        if (password.length < 6) {
            return errorResponse('Password must be at least 6 characters', 'VALIDATION_ERROR', 400);
        }

        const existingUser = await User.findOne({ username: username.toLowerCase() });
        if (existingUser) {
            return errorResponse('Username already exists', 'USER_EXISTS', 409);
        }

        const user = new User({
            name: name.trim(),
            username: username.toLowerCase().trim(),
            password
        });

        await user.save();

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
        return errorResponse('Registration failed', 'REGISTRATION_ERROR', 500);
    }
};

const handleLogin = async ({ username, password }) => {
    try {
        if (!username || !password) {
            return errorResponse('Username and password are required', 'VALIDATION_ERROR', 400);
        }

        const user = await User.findOne({ username: username.toLowerCase() });
        if (!user) {
            return errorResponse('Invalid credentials', 'INVALID_CREDENTIALS', 401);
        }

        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            return errorResponse('Invalid credentials', 'INVALID_CREDENTIALS', 401);
        }

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
        return errorResponse('Login failed', 'LOGIN_ERROR', 500);
    }
};

module.exports = { handleRegister, handleLogin };

// tests/mathGenerator.test.js
const { generateMathEquation, validateAnswer, DIFFICULTIES } = require('../shared/utils/mathGenerator');

describe('Math Generator', () => {
    describe('generateMathEquation', () => {
        it('should generate equation for difficulty 1', () => {
            const equation = generateMathEquation(1);
            expect(equation).toHaveProperty('equation');
            expect(equation).toHaveProperty('answer');
            expect(equation.difficulty).toBe(1);
        });

        it('should generate equation for difficulty 4', () => {
            const equation = generateMathEquation(4);
            expect(equation).toHaveProperty('equation');
            expect(equation).toHaveProperty('answer');
            expect(equation.difficulty).toBe(4);
        });

        it('should throw error for invalid difficulty', () => {
            expect(() => generateMathEquation(5)).toThrow('Invalid difficulty level');
        });
    });

    describe('validateAnswer', () => {
        it('should validate correct answer', () => {
            expect(validateAnswer(42, 42)).toBe(true);
            expect(validateAnswer(42.01, 42)).toBe(true); // Within tolerance
        });

        it('should reject incorrect answer', () => {
            expect(validateAnswer(40, 42)).toBe(false);
            expect(validateAnswer('invalid', 42)).toBe(false);
        });
    });
});

// package.json test script updates
module.exports = {
    testEnvironment: 'node',
    collectCoverageFrom: [
        'services/**/*.js',
        'shared/**/*.js',
        '!**/node_modules/**',
        '!**/coverage/**'
    ],
    testMatch: [
        '**/tests/**/*.test.js'
    ],
    setupFilesAfterEnv: ['<rootDir>/tests/setup.js']
};