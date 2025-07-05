class CircuitBreaker {
    constructor(options = {}) {
        this.failureThreshold = options.failureThreshold || 5;
        this.resetTimeout = options.resetTimeout || 60000;
        this.monitoringPeriod = options.monitoringPeriod || 10000;

        this.state = 'CLOSED';
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