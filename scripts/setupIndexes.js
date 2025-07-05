const mongoose = require('mongoose');
const connectDB = require('../shared/config/database');

const setupDatabaseIndexes = async () => {
    try {
        console.log('Connecting to database...');
        await connectDB();

        const db = mongoose.connection.db;
        console.log('Database connected, creating indexes...');

        try {
            await db.collection('users').createIndex({ username: 1 }, { unique: true });
            console.log('✅ Created unique index on users.username');
        } catch (error) {
            console.log('⚠️  Users username index may already exist');
        }

        try {
            await db.collection('users').createIndex({ createdAt: -1 });
            console.log('✅ Created index on users.createdAt');
        } catch (error) {
            console.log('⚠️  Users createdAt index may already exist');
        }

        try {
            await db.collection('games').createIndex({ status: 1, createdAt: -1 });
            console.log('✅ Created compound index on games.status and createdAt');
        } catch (error) {
            console.log('⚠️  Games status/createdAt index may already exist');
        }

        try {
            await db.collection('games').createIndex({ createdBy: 1 });
            console.log('✅ Created index on games.createdBy');
        } catch (error) {
            console.log('⚠️  Games createdBy index may already exist');
        }

        try {
            await db.collection('games').createIndex({ players: 1 });
            console.log('✅ Created index on games.players');
        } catch (error) {
            console.log('⚠️  Games players index may already exist');
        }

        try {
            await db.collection('games').createIndex({ difficulty: 1, status: 1 });
            console.log('✅ Created compound index on games.difficulty and status');
        } catch (error) {
            console.log('⚠️  Games difficulty/status index may already exist');
        }

        try {
            await db.collection('gamesessions').createIndex({ gameId: 1, playerId: 1 }, { unique: true });
            console.log('✅ Created unique compound index on gamesessions.gameId and playerId');
        } catch (error) {
            console.log('⚠️  GameSessions gameId/playerId index may already exist');
        }

        try {
            await db.collection('gamesessions').createIndex({ gameId: 1 });
            console.log('✅ Created index on gamesessions.gameId');
        } catch (error) {
            console.log('⚠️  GameSessions gameId index may already exist');
        }

        try {
            await db.collection('gamesessions').createIndex({ playerId: 1 });
            console.log('✅ Created index on gamesessions.playerId');
        } catch (error) {
            console.log('⚠️  GameSessions playerId index may already exist');
        }

        try {
            await db.collection('gamesessions').createIndex({ totalScore: -1 });
            console.log('✅ Created index on gamesessions.totalScore');
        } catch (error) {
            console.log('⚠️  GameSessions totalScore index may already exist');
        }

        try {
            await db.collection('gamesessions').createIndex({ 'answers.isCorrect': 1 });
            console.log('✅ Created index on gamesessions.answers.isCorrect');
        } catch (error) {
            console.log('⚠️  GameSessions answers.isCorrect index may already exist');
        }

        console.log('\n🎉 Database indexes setup completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Failed to create indexes:', error.message);
        process.exit(1);
    }
};

process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await mongoose.connection.close();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\nShutting down...');
    await mongoose.connection.close();
    process.exit(0);
});

setupDatabaseIndexes();