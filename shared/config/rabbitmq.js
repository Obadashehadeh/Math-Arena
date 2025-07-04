const amqp = require('amqplib');
require('dotenv').config();

class RabbitMQConnection {
    constructor() {
        this.connection = null;
        this.channel = null;
    }

    async connect() {
        try {
            this.connection = await amqp.connect(process.env.RABBITMQ_URL);
            this.channel = await this.connection.createChannel();

            console.log('RabbitMQ Connected');

            // Handle connection events
            this.connection.on('error', (err) => {
                console.error('RabbitMQ connection error:', err);
            });

            this.connection.on('close', () => {
                console.log('RabbitMQ connection closed');
            });

            return this.channel;
        } catch (error) {
            console.error('RabbitMQ connection failed:', error.message);
            throw error;
        }
    }

    async setupQueues() {
        if (!this.channel) throw new Error('Channel not initialized');

        // Declare queues for each service
        await this.channel.assertQueue('auth_queue', { durable: true });
        await this.channel.assertQueue('game_queue', { durable: true });
        await this.channel.assertQueue('players_queue', { durable: true });

        console.log('RabbitMQ queues setup completed');
    }

    async sendRPC(queue, message) {
        return new Promise(async (resolve, reject) => {
            try {
                const correlationId = Math.random().toString(36).substring(2, 15);
                const replyQueue = await this.channel.assertQueue('', { exclusive: true });

                // Set up reply listener
                this.channel.consume(replyQueue.queue, (msg) => {
                    if (msg.properties.correlationId === correlationId) {
                        resolve(JSON.parse(msg.content.toString()));
                        this.channel.ack(msg);
                    }
                });

                // Send the message
                this.channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)), {
                    correlationId,
                    replyTo: replyQueue.queue
                });

                // Timeout after 10 seconds
                setTimeout(() => {
                    reject(new Error('RPC call timeout'));
                }, 10000);

            } catch (error) {
                reject(error);
            }
        });
    }

    async close() {
        if (this.connection) {
            await this.connection.close();
        }
    }
}

module.exports = RabbitMQConnection;