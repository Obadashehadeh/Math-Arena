// shared/config/rabbitmq.js
const amqp = require('amqplib');
const CircuitBreaker = require('../utils/circuitBreaker');
require('dotenv').config();

class RabbitMQConnection {
    constructor() {
        this.connection = null;
        this.channel = null;
        this.circuitBreaker = new CircuitBreaker({
            failureThreshold: 5,
            resetTimeout: 30000, // 30 seconds
            monitoringPeriod: 10000 // 10 seconds
        });
        this.isConnected = false;
    }

    async connect() {
        return this.circuitBreaker.execute(async () => {
            try {
                console.log('Connecting to RabbitMQ:', process.env.RABBITMQ_URL);

                this.connection = await amqp.connect(process.env.RABBITMQ_URL);
                this.channel = await this.connection.createChannel();

                console.log('RabbitMQ Connected');
                this.isConnected = true;

                // Handle connection events
                this.connection.on('error', (err) => {
                    console.error('RabbitMQ connection error:', err);
                    this.isConnected = false;
                });

                this.connection.on('close', () => {
                    console.log('RabbitMQ connection closed');
                    this.isConnected = false;
                });

                // Handle channel events
                this.channel.on('error', (err) => {
                    console.error('RabbitMQ channel error:', err);
                });

                this.channel.on('close', () => {
                    console.log('RabbitMQ channel closed');
                });

                return this.channel;
            } catch (error) {
                console.error('RabbitMQ connection failed:', error.message);
                this.isConnected = false;
                throw error;
            }
        });
    }

    async setupQueues() {
        if (!this.channel) throw new Error('Channel not initialized');

        try {
            // Declare queues for each service with durability
            await this.channel.assertQueue('auth_queue', {
                durable: true,
                arguments: {
                    'x-message-ttl': 60000, // 1 minute TTL
                    'x-max-length': 1000    // Max 1000 messages
                }
            });

            await this.channel.assertQueue('game_queue', {
                durable: true,
                arguments: {
                    'x-message-ttl': 60000,
                    'x-max-length': 1000
                }
            });

            await this.channel.assertQueue('players_queue', {
                durable: true,
                arguments: {
                    'x-message-ttl': 60000,
                    'x-max-length': 1000
                }
            });

            console.log('RabbitMQ queues setup completed');
        } catch (error) {
            console.error('Queue setup failed:', error);
            throw error;
        }
    }

    async sendRPC(queue, message, timeout = 10000) {
        if (!this.isConnected || !this.channel) {
            throw new Error('RabbitMQ not connected');
        }

        return this.circuitBreaker.execute(async () => {
            return new Promise(async (resolve, reject) => {
                let timeoutId;
                let replyConsumerTag;

                try {
                    const correlationId = this.generateCorrelationId();
                    const replyQueue = await this.channel.assertQueue('', {
                        exclusive: true,
                        autoDelete: true
                    });

                    // Set up timeout
                    timeoutId = setTimeout(() => {
                        if (replyConsumerTag) {
                            this.channel.cancel(replyConsumerTag).catch(() => {});
                        }
                        reject(new Error(`RPC call timeout after ${timeout}ms`));
                    }, timeout);

                    // Set up reply listener
                    const { consumerTag } = await this.channel.consume(
                        replyQueue.queue,
                        (msg) => {
                            if (msg && msg.properties.correlationId === correlationId) {
                                clearTimeout(timeoutId);

                                try {
                                    const response = JSON.parse(msg.content.toString());
                                    resolve(response);
                                } catch (parseError) {
                                    reject(new Error('Invalid response format'));
                                }

                                this.channel.ack(msg);
                                this.channel.cancel(consumerTag).catch(() => {});
                            }
                        },
                        { noAck: false }
                    );

                    replyConsumerTag = consumerTag;

                    // Send the message
                    const sent = this.channel.sendToQueue(
                        queue,
                        Buffer.from(JSON.stringify(message)),
                        {
                            correlationId,
                            replyTo: replyQueue.queue,
                            persistent: true,
                            timestamp: Date.now()
                        }
                    );

                    if (!sent) {
                        clearTimeout(timeoutId);
                        reject(new Error('Failed to send message to queue'));
                    }

                } catch (error) {
                    if (timeoutId) clearTimeout(timeoutId);
                    if (replyConsumerTag) {
                        this.channel.cancel(replyConsumerTag).catch(() => {});
                    }
                    reject(error);
                }
            });
        });
    }

    generateCorrelationId() {
        return Math.random().toString(36).substring(2, 15) +
            Math.random().toString(36).substring(2, 15);
    }

    async close() {
        try {
            if (this.channel) {
                await this.channel.close();
                this.channel = null;
            }
            if (this.connection) {
                await this.connection.close();
                this.connection = null;
            }
            this.isConnected = false;
            console.log('RabbitMQ connection closed gracefully');
        } catch (error) {
            console.error('Error closing RabbitMQ connection:', error);
        }
    }

    getCircuitBreakerState() {
        return {
            ...this.circuitBreaker.getState(),
            isConnected: this.isConnected,
            hasChannel: !!this.channel
        };
    }

    isHealthy() {
        return this.isConnected &&
            this.channel !== null &&
            this.circuitBreaker.getState().state !== 'OPEN';
    }
}

module.exports = RabbitMQConnection;