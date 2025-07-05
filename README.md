# Math Arena - Microservices Backend

A sophisticated, scalable backend system for a competitive math game platform with single/multiplayer capabilities, comprehensive monitoring, and microservices architecture.

## Architecture Overview

### Microservices
- **Auth Service** (Port 3001): User registration and authentication
- **Game Service** (Port 3002): Game logic, question generation, answer submission
- **Players Service** (Port 3003): Player results and game statistics
- **Orchestrator Service** (Port 3000): API gateway and request routing

### Infrastructure
- **Database**: MongoDB with proper indexing strategies
- **Message Queue**: RabbitMQ for inter-service communication
- **API Gateway**: Express.js with middleware orchestration
- **Rate Limiting**: Implemented with circuit breaker patterns
- **Security**: JWT authentication, input validation, helmet middleware

## Prerequisites

- Node.js (v14 or higher)
- Docker and Docker Compose
- MongoDB
- RabbitMQ

## Quick Start

### 1. Clone and Setup
```bash
git clone <repository-url>
cd math-arena
npm install
```

### 2. Environment Configuration
Copy `.env` file with the following variables:
```env
NODE_ENV=development
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production-2024
MONGODB_URI=mongodb://localhost:27017/math-arena
RABBITMQ_URL=amqp://admin:admin123@localhost:5672
AUTH_SERVICE_PORT=3001
GAME_SERVICE_PORT=3002
PLAYERS_SERVICE_PORT=3003
ORCHESTRATOR_PORT=3000
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
```

### 3. Start Infrastructure
```bash
npm run docker:up
```

### 4. Start All Services
```bash
npm start
```

### 5. Alternative: Development Mode
```bash
npm run dev
```

## API Endpoints

### Authentication Endpoints
```http
POST /auth/register
POST /auth/login
```

### Game Endpoints (Protected)
```http
POST /game/start
POST /game/{game_id}/submit
PUT /game/{game_id}/join
GET /game/{game_id}/end
```

### Results Endpoints (Protected)
```http
GET /result/me/{game_id}
GET /player/all/{game_id}
```

## API Usage Examples

### 1. Register User
```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "username": "johndoe",
    "password": "password123"
  }'
```

### 2. Login
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "johndoe",
    "password": "password123"
  }'
```

### 3. Start Game
```bash
curl -X POST http://localhost:3000/game/start \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "John Doe",
    "difficulty": 2
  }'
```

### 4. Submit Answer
```bash
curl -X POST http://localhost:3000/game/GAME_ID/submit \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "answer": 42.5
  }'
```

### 5. Join Game
```bash
curl -X PUT http://localhost:3000/game/GAME_ID/join \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 6. End Game
```bash
curl -X GET http://localhost:3000/game/GAME_ID/end \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 7. Get Player Results
```bash
curl -X GET http://localhost:3000/result/me/GAME_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 8. Get Game Results (All Players)
```bash
curl -X GET http://localhost:3000/player/all/GAME_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Game Difficulty Levels

| Difficulty | Operands | Number Length | Operations |
|------------|----------|---------------|------------|
| 1          | 2        | 1 digit       | + - * /    |
| 2          | 3        | 2 digit       | + - * /    |
| 3          | 4        | 3 digit       | + - * /    |
| 4          | 5        | 4 digit       | + - * /    |

## Response Format

### Success Response
```json
{
  "success": true,
  "message": "Success message",
  "data": { /* response data */ },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Error message",
    "statusCode": 400
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Testing

### Run Tests
```bash
npm test
```

### Health Checks
```bash
curl http://localhost:3000/health
curl http://localhost:3001/health
curl http://localhost:3002/health
curl http://localhost:3003/health
```

## Docker Commands

### Start Infrastructure
```bash
docker-compose up -d
```

### Stop Infrastructure
```bash
docker-compose down
```

### View Logs
```bash
docker-compose logs -f
```

## Development Scripts

- `npm start` - Start all services concurrently
- `npm run start:auth` - Start auth service only
- `npm run start:game` - Start game service only
- `npm run start:players` - Start players service only
- `npm run start:orchestrator` - Start orchestrator service only
- `npm test` - Run test suite
- `npm run dev` - Start infrastructure and all services
- `npm run docker:up` - Start Docker containers
- `npm run docker:down` - Stop Docker containers

## Security Features

- JWT-based authentication
- Password hashing with bcrypt
- Rate limiting (15 requests/15 minutes for auth, 100 requests/15 minutes for general)
- Input validation and sanitization
- Helmet middleware for security headers
- CORS protection
- Request size limiting

## Database Schema

### Users Collection
- `name`: Player's display name
- `username`: Unique login identifier
- `password`: Hashed password
- `createdAt`, `updatedAt`: Timestamps

### Games Collection
- `difficulty`: Game difficulty (1-4)
- `status`: Game status (active/ended)
- `players`: Array of player IDs
- `questions`: Array of generated questions
- `createdBy`: Game creator ID
- `createdAt`, `updatedAt`: Timestamps

### Game Sessions Collection
- `gameId`: Reference to game
- `playerId`: Reference to player
- `playerName`: Player's name
- `answers`: Array of submitted answers
- `totalScore`: Number of correct answers
- `totalTime`: Total time spent
- `currentQuestionIndex`: Current question index
- `joinedAt`: Join timestamp

## Monitoring and Observability

### Logging
- Structured logging with Winston
- Request/response logging
- Error tracking
- Performance metrics

### Health Monitoring
- Service health endpoints
- Database connection monitoring
- RabbitMQ connection monitoring

## Production Considerations

### Environment Variables
Update the following for production:
- `JWT_SECRET`: Use a strong, unique secret
- `MONGODB_URI`: Production MongoDB connection
- `RABBITMQ_URL`: Production RabbitMQ connection
- `NODE_ENV=production`

### Scaling
- Each service can be scaled independently
- Use load balancers for the orchestrator service
- Consider Redis for session management in multi-instance deployments

### Security
- Use HTTPS in production
- Implement API key authentication for service-to-service communication
- Regular security audits and dependency updates
- Use environment-specific secrets management

## Troubleshooting

### Common Issues

**Service Connection Errors**
- Ensure MongoDB and RabbitMQ are running
- Check connection strings in `.env`
- Verify network connectivity between services

**Authentication Errors**
- Verify JWT secret is consistent across services
- Check token expiration
- Ensure proper Authorization header format

**Database Errors**
- Check MongoDB connection and permissions
- Verify database name matches configuration
- Ensure sufficient disk space

**RabbitMQ Errors**
- Verify RabbitMQ is running and accessible
- Check queue declarations
- Monitor memory usage

### Logs Location
- Application logs: Console output
- MongoDB logs: Docker container logs
- RabbitMQ logs: Docker container logs

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request
