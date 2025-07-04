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
        max: 4
    },
    status: {
        type: String,
        enum: ['active', 'ended'],
        default: 'active'
    },
    players: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    questions: [questionSchema],
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    endedAt: {
        type: Date
    }
}, {
    timestamps: true
});

// Indexes for better query performance
gameSchema.index({ status: 1, createdAt: -1 });
gameSchema.index({ createdBy: 1 });
gameSchema.index({ players: 1 });

module.exports = mongoose.model('Game', gameSchema);