const mongoose = require('mongoose');

const answerSchema = new mongoose.Schema({
    questionIndex: {
        type: Number,
        required: true
    },
    submittedAnswer: {
        type: Number,
        required: true
    },
    isCorrect: {
        type: Boolean,
        required: true
    },
    timeTaken: {
        type: Number, // in seconds
        required: true
    },
    submittedAt: {
        type: Date,
        default: Date.now
    }
});

const gameSessionSchema = new mongoose.Schema({
    gameId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Game',
        required: true
    },
    playerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    playerName: {
        type: String,
        required: true
    },
    answers: [answerSchema],
    totalScore: {
        type: Number,
        default: 0
    },
    totalTime: {
        type: Number, // Total time spent in seconds
        default: 0
    },
    currentQuestionIndex: {
        type: Number,
        default: 0
    },
    lastAnswerTime: {
        type: Date,
        default: Date.now
    },
    joinedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Compound index for unique player-game combinations
gameSessionSchema.index({ gameId: 1, playerId: 1 }, { unique: true });
gameSessionSchema.index({ gameId: 1 });
gameSessionSchema.index({ playerId: 1 });

// Virtual for calculating current score percentage
gameSessionSchema.virtual('scorePercentage').get(function() {
    if (this.answers.length === 0) return 0;
    return (this.totalScore / this.answers.length) * 100;
});

// Method to get best answer (fastest correct answer)
gameSessionSchema.methods.getBestAnswer = function() {
    const correctAnswers = this.answers.filter(answer => answer.isCorrect);
    if (correctAnswers.length === 0) return null;

    return correctAnswers.reduce((best, current) => {
        return current.timeTaken < best.timeTaken ? current : best;
    });
};

module.exports = mongoose.model('GameSession', gameSessionSchema);