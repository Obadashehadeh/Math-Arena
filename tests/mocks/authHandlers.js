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