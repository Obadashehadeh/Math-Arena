db = db.getSiblingDB('math-arena');

db.createUser({
    user: 'mathapp',
    pwd: process.env.MONGO_PASSWORD || 'defaultpassword',
    roles: [
        {
            role: 'readWrite',
            db: 'math-arena'
        }
    ]
});

print('Creating indexes...');

db.users.createIndex({ username: 1 }, { unique: true });
db.users.createIndex({ createdAt: -1 });

db.games.createIndex({ status: 1, createdAt: -1 });
db.games.createIndex({ createdBy: 1 });
db.games.createIndex({ players: 1 });
db.games.createIndex({ difficulty: 1, status: 1 });

db.gamesessions.createIndex({ gameId: 1, playerId: 1 }, { unique: true });
db.gamesessions.createIndex({ gameId: 1 });
db.gamesessions.createIndex({ playerId: 1 });
db.gamesessions.createIndex({ totalScore: -1 });
db.gamesessions.createIndex({ 'answers.isCorrect': 1 });

print('Database initialization completed successfully');
print('Created user: mathapp');
print('Created database: math-arena');
print('Created indexes for optimal performance');