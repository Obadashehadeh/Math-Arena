# Dockerfile
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Create logs directory
RUN mkdir -p logs

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S mathapp -u 1001
RUN chown -R mathapp:nodejs /app
USER mathapp

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js

# Start the application
CMD ["npm", "start"]

# docker-compose.prod.yml
version: '3.8'

services:
  mongodb:
    image: mongo:5
    container_name: math-arena-mongodb
    restart: unless-stopped
    ports:
      - "27017:27017"
    environment:
      MONGO_INITDB_DATABASE: math-arena
      MONGO_INITDB_ROOT_USERNAME: ${MONGO_ROOT_USERNAME}
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_ROOT_PASSWORD}
    volumes:
      - mongodb_data:/data/db
      - ./scripts/mongo-init.js:/docker-entrypoint-initdb.d/mongo-init.js:ro
    networks:
      - math-arena-network
    command: --quiet

  rabbitmq:
    image: rabbitmq:3-management
    container_name: math-arena-rabbitmq
    restart: unless-stopped
    ports:
      - "5672:5672"
      - "15672:15672"
    environment:
      RABBITMQ_DEFAULT_USER: ${RABBITMQ_USER}
      RABBITMQ_DEFAULT_PASS: ${RABBITMQ_PASSWORD}
    volumes:
      - rabbitmq_data:/var/lib/rabbitmq
    networks:
      - math-arena-network
    healthcheck:
      test: rabbitmq-diagnostics -q ping
      interval: 30s
      timeout: 30s
      retries: 3

  auth-service:
    build: .
    container_name: math-arena-auth
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - SERVICE_NAME=auth-service
      - AUTH_SERVICE_PORT=3001
      - MONGODB_URI=mongodb://mathapp:${MONGO_PASSWORD}@mongodb:27017/math-arena
      - RABBITMQ_URL=amqp://${RABBITMQ_USER}:${RABBITMQ_PASSWORD}@rabbitmq:5672
      - JWT_SECRET=${JWT_SECRET}
    command: ["node", "services/auth-service/index.js"]
    depends_on:
      - mongodb
      - rabbitmq
    networks:
      - math-arena-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  game-service:
    build: .
    container_name: math-arena-game
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - SERVICE_NAME=game-service
      - GAME_SERVICE_PORT=3002
      - MONGODB_URI=mongodb://mathapp:${MONGO_PASSWORD}@mongodb:27017/math-arena
      - RABBITMQ_URL=amqp://${RABBITMQ_USER}:${RABBITMQ_PASSWORD}@rabbitmq:5672
      - JWT_SECRET=${JWT_SECRET}
    command: ["node", "services/game-service/index.js"]
    depends_on:
      - mongodb
      - rabbitmq
    networks:
      - math-arena-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3002/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  players-service:
    build: .
    container_name: math-arena-players
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - SERVICE_NAME=players-service
      - PLAYERS_SERVICE_PORT=3003
      - MONGODB_URI=mongodb://mathapp:${MONGO_PASSWORD}@mongodb:27017/math-arena
      - RABBITMQ_URL=amqp://${RABBITMQ_USER}:${RABBITMQ_PASSWORD}@rabbitmq:5672
      - JWT_SECRET=${JWT_SECRET}
    command: ["node", "services/players-service/index.js"]
    depends_on:
      - mongodb
      - rabbitmq
    networks:
      - math-arena-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3003/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  orchestrator-service:
    build: .
    container_name: math-arena-orchestrator
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - SERVICE_NAME=orchestrator-service
      - ORCHESTRATOR_PORT=3000
      - RABBITMQ_URL=amqp://${RABBITMQ_USER}:${RABBITMQ_PASSWORD}@rabbitmq:5672
      - JWT_SECRET=${JWT_SECRET}
      - RATE_LIMIT_WINDOW_MS=900000
      - RATE_LIMIT_MAX_REQUESTS=100
    command: ["node", "services/orchestrator-service/index.js"]
    depends_on:
      - rabbitmq
      - auth-service
      - game-service
      - players-service
    networks:
      - math-arena-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  mongodb_data:
  rabbitmq_data:

networks:
  math-arena-network:
    driver: bridge

# .dockerignore
node_modules
npm-debug.log
.env
.git
.gitignore
README.md
.nyc_output
coverage
.coverage
.coverage.*
Dockerfile
.dockerignore
tests
*.test.js
.idea
logs

# healthcheck.js
const http = require('http');

const options = {
  hostname: 'localhost',
  port: process.env.PORT || 3000,
  path: '/health',
  method: 'GET',
  timeout: 2000
};

const req = http.request(options, (res) => {
  if (res.statusCode === 200) {
    process.exit(0);
  } else {
    process.exit(1);
  }
});

req.on('error', () => {
  process.exit(1);
});

req.on('timeout', () => {
  req.destroy();
  process.exit(1);
});

req.end();

# scripts/mongo-init.js
db = db.getSiblingDB('math-arena');

db.createUser({
  user: 'mathapp',
  pwd: process.env.MONGO_PASSWORD,
  roles: [
    {
      role: 'readWrite',
      db: 'math-arena'
    }
  ]
});

# .env.example
NODE_ENV=development

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production-2024

# Database Configuration
MONGODB_URI=mongodb://localhost:27017/math-arena
MONGO_ROOT_USERNAME=root
MONGO_ROOT_PASSWORD=rootpassword
MONGO_PASSWORD=apppassword

# RabbitMQ Configuration
RABBITMQ_URL=amqp://admin:admin123@localhost:5672
RABBITMQ_USER=admin
RABBITMQ_PASSWORD=admin123

# Service Ports
AUTH_SERVICE_PORT=3001
GAME_SERVICE_PORT=3002
PLAYERS_SERVICE_PORT=3003
ORCHESTRATOR_PORT=3000

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=info