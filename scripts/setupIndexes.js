// scripts/setupIndexes.js
const mongoose = require('mongoose');
const connectDB = require('../shared/config/database');

const setupDatabaseIndexes = async () => {
    try {
        await connectDB();

        const db = mongoose.connection.db;

        // Users collection indexes
        await db.collection('users').createIndex({ username: 1 }, { unique: true });
        await db.collection('users').createIndex({ createdAt: -1 });

        // Games collection indexes
        await db.collection('games').createIndex({ status: 1, createdAt: -1 });
        await db.collection('games').createIndex({ createdBy: 1 });
        await db.collection('games').createIndex({ players: 1 });
        await db.collection('games').createIndex({ difficulty: 1, status: 1 });

        // Game sessions collection indexes
        await db.collection('gamesessions').createIndex({ gameId: 1, playerId: 1 }, { unique: true });
        await db.collection('gamesessions').createIndex({ gameId: 1 });
        await db.collection('gamesessions').createIndex({ playerId: 1 });
        await db.collection('gamesessions').createIndex({ totalScore: -1 });
        await db.collection('gamesessions').createIndex({ 'answers.isCorrect': 1 });

        console.log('Database indexes created successfully');
        process.exit(0);
    } catch (error) {
        console.error('Failed to create indexes:', error);
        process.exit(1);
    }
};

setupDatabaseIndexes();

// shared/models/User.js (Updated with better indexes)
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Name is required'],
        trim: true,
        maxlength: [50, 'Name cannot exceed 50 characters']
    },
    username: {
        type: String,
        required: [true, 'Username is required'],
        unique: true,
        trim: true,
        lowercase: true,
        minlength: [3, 'Username must be at least 3 characters'],
        maxlength: [20, 'Username cannot exceed 20 characters'],
        index: true
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [6, 'Password must be at least 6 characters']
    },
    gamesPlayed: {
        type: Number,
        default: 0
    },
    totalScore: {
        type: Number,
        default: 0
    },
    averageScore: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

// Compound indexes
userSchema.index({ username: 1 }, { unique: true });
userSchema.index({ createdAt: -1 });
userSchema.index({ gamesPlayed: -1, averageScore: -1 });

userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();

    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

userSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.toJSON = function() {
    const userObject = this.toObject();
    delete userObject.password;
    return userObject;
};

module.exports = mongoose.model('User', userSchema);

// shared/models/Game.js (Updated with better performance)
const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
    equation: {
        type: String,
        required: true
    },
    answer: {
        type: Number,
        required: true
    },
    difficulty: {
        type: Number,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const gameSchema = new mongoose.Schema({
    difficulty: {
        type: Number,
        required: true,
        min: 1,
        max: 4,
        index: true
    },
    status: {
        type: String,
        enum: ['active', 'ended'],
        default: 'active',
        index: true
    },
    players: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    questions: [questionSchema],
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    maxPlayers: {
        type: Number,
        default: 10
    },
    endedAt: {
        type: Date
    },
    gameStats: {
        totalQuestions: { type: Number, default: 0 },
        totalPlayers: { type: Number, default: 0 },
        averageScore: { type: Number, default: 0 },
        fastestAnswer: { type: Number }, // in seconds
        highestScore: { type: Number, default: 0 }
    }
}, {
    timestamps: true
});

// Compound indexes for better query performance
gameSchema.index({ status: 1, createdAt: -1 });
gameSchema.index({ difficulty: 1, status: 1 });
gameSchema.index({ createdBy: 1, status: 1 });
gameSchema.index({ players: 1 });
gameSchema.index({ 'gameStats.averageScore': -1 });

// Methods for game statistics
gameSchema.methods.updateGameStats = async function() {
    const GameSession = require('./GameSession');

    const sessions = await GameSession.find({ gameId: this._id });

    if (sessions.length > 0) {
        const totalScore = sessions.reduce((sum, session) => sum + session.totalScore, 0);
        const totalAnswers = sessions.reduce((sum, session) => sum + session.answers.length, 0);

        this.gameStats.totalPlayers = sessions.length;
        this.gameStats.totalQuestions = this.questions.length;
        this.gameStats.averageScore = totalAnswers > 0 ? totalScore / totalAnswers : 0;

        // Find fastest answer
        let fastestTime = Infinity;
        sessions.forEach(session => {
            session.answers.forEach(answer => {
                if (answer.isCorrect && answer.timeTaken < fastestTime) {
                    fastestTime = answer.timeTaken;
                }
            });
        });

        if (fastestTime !== Infinity) {
            this.gameStats.fastestAnswer = fastestTime;
        }

        // Find highest score
        const highestScore = Math.max(...sessions.map(s => s.totalScore));
        this.gameStats.highestScore = highestScore;

        await this.save();
    }
};

module.exports = mongoose.model('Game', gameSchema);