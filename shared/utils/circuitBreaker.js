// shared/utils/circuitBreaker.js
class CircuitBreaker {
    constructor(options = {}) {
        this.failureThreshold = options.failureThreshold || 5;
        this.resetTimeout = options.resetTimeout || 60000; // 1 minute
        this.monitoringPeriod = options.monitoringPeriod || 10000; // 10 seconds

        this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
        this.failures = 0;
        this.lastFailureTime = null;
        this.successCount = 0;
        this.requestCount = 0;
    }

    async execute(operation) {
        if (this.state === 'OPEN') {
            if (Date.now() - this.lastFailureTime >= this.resetTimeout) {
                this.state = 'HALF_OPEN';
                this.successCount = 0;
            } else {
                throw new Error('Circuit breaker is OPEN');
            }
        }

        try {
            const result = await operation();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure();
            throw error;
        }
    }

    onSuccess() {
        this.failures = 0;
        this.successCount++;

        if (this.state === 'HALF_OPEN' && this.successCount >= 3) {
            this.state = 'CLOSED';
            this.successCount = 0;
        }
    }

    onFailure() {
        this.failures++;
        this.lastFailureTime = Date.now();

        if (this.failures >= this.failureThreshold) {
            this.state = 'OPEN';
        }
    }

    getState() {
        return {
            state: this.state,
            failures: this.failures,
            successCount: this.successCount,
            lastFailureTime: this.lastFailureTime
        };
    }
}

module.exports = CircuitBreaker;

// shared/config/rabbitmq.js (Updated with circuit breaker)
const amqp = require('amqplib');
const CircuitBreaker = require('../utils/circuitBreaker');
require('dotenv').config();

class RabbitMQConnection {
    constructor() {
        this.connection = null;
        this.channel = null;
        this.circuitBreaker = new CircuitBreaker({
            failureThreshold: 5,
            resetTimeout: 30000
        });
    }

    async connect() {
        return this.circuitBreaker.execute(async () => {
            try {
                this.connection = await amqp.connect(process.env.RABBITMQ_URL);
                this.channel = await this.connection.createChannel();

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
        });
    }

    async setupQueues() {
        if (!this.channel) throw new Error('Channel not initialized');

        await this.channel.assertQueue('auth_queue', { durable: true });
        await this.channel.assertQueue('game_queue', { durable: true });
        await this.channel.assertQueue('players_queue', { durable: true });
    }

    async sendRPC(queue, message) {
        return this.circuitBreaker.execute(async () => {
            return new Promise(async (resolve, reject) => {
                try {
                    const correlationId = Math.random().toString(36).substring(2, 15);
                    const replyQueue = await this.channel.assertQueue('', { exclusive: true });

                    this.channel.consume(replyQueue.queue, (msg) => {
                        if (msg.properties.correlationId === correlationId) {
                            resolve(JSON.parse(msg.content.toString()));
                            this.channel.ack(msg);
                        }
                    });

                    this.channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)), {
                        correlationId,
                        replyTo: replyQueue.queue
                    });

                    setTimeout(() => {
                        reject(new Error('RPC call timeout'));
                    }, 10000);

                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    async close() {
        if (this.connection) {
            await this.connection.close();
        }
    }

    getCircuitBreakerState() {
        return this.circuitBreaker.getState();
    }
}

module.exports = RabbitMQConnection;