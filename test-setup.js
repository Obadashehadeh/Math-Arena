// test-setup.js
// Quick test setup with in-memory MongoDB

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

async function setupTestEnvironment() {
    try {
        console.log('🚀 Starting test environment setup...');

        // Start in-memory MongoDB
        console.log('📦 Starting in-memory MongoDB...');
        const mongod = await MongoMemoryServer.create();
        const uri = mongod.getUri();

        console.log('✅ In-memory MongoDB started at:', uri);

        // Connect to the in-memory database
        await mongoose.connect(uri);
        console.log('✅ Connected to in-memory MongoDB');

        // Update environment variable
        process.env.MONGODB_URI = uri;

        console.log('🎯 Test environment ready!');
        console.log('📝 You can now test the services without Docker');
        console.log('');
        console.log('Next steps:');
        console.log('1. Update your .env file with:');
        console.log(`   MONGODB_URI=${uri}`);
        console.log('2. Comment out RabbitMQ connections in services');
        console.log('3. Run npm start');

        // Keep the server running
        process.on('SIGINT', async () => {
            console.log('\n🛑 Shutting down test environment...');
            await mongoose.connection.close();
            await mongod.stop();
            console.log('✅ Test environment stopped');
            process.exit(0);
        });

        console.log('\nPress Ctrl+C to stop the test environment');

    } catch (error) {
        console.error('❌ Failed to setup test environment:', error.message);
        process.exit(1);
    }
}

setupTestEnvironment();