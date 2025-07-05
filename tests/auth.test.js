const request = require('supertest');
const express = require('express');
const connectDB = require('../shared/config/database');
const User = require('../shared/models/User');

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