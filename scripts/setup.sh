# scripts/setup.sh
#!/bin/bash

set -e

echo "🚀 Setting up Math Arena Project..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 14+ first."
    exit 1
fi

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

echo "✅ Prerequisites check passed"

# Install Node.js dependencies
echo "📦 Installing Node.js dependencies..."
npm install

# Create environment file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating environment file..."
    cp .env.example .env
    echo "⚠️  Please update the .env file with your configuration"
fi

# Create logs directory
echo "📁 Creating logs directory..."
mkdir -p logs

# Start infrastructure services
echo "🐳 Starting Docker infrastructure..."
docker-compose up -d mongodb rabbitmq

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 10

# Setup database indexes
echo "🗄️  Setting up database indexes..."
npm run setup:indexes

echo "✅ Setup completed successfully!"
echo ""
echo "🎯 Next steps:"
echo "1. Update .env file with your configuration"
echo "2. Run 'npm start' to start all services"
echo "3. Visit http://localhost:3000/health to check API status"
echo ""
echo "📚 Available commands:"
echo "  npm start          - Start all services in development mode"
echo "  npm test           - Run tests"
echo "  npm run docker:up  - Start infrastructure only"
echo "  npm run dev        - Start infrastructure and services together"

# scripts/deploy.sh
#!/bin/bash

set -e

echo "🚀 Deploying Math Arena to Production..."

# Build Docker images
echo "🔨 Building Docker images..."
docker build -t math-arena:latest .

# Create production environment file
if [ ! -f .env.prod ]; then
    echo "📝 Creating production environment file..."
    cat > .env.prod << EOF
NODE_ENV=production
JWT_SECRET=$(openssl rand -base64 32)
MONGO_ROOT_USERNAME=root
MONGO_ROOT_PASSWORD=$(openssl rand -base64 32)
MONGO_PASSWORD=$(openssl rand -base64 32)
RABBITMQ_USER=admin
RABBITMQ_PASSWORD=$(openssl rand -base64 32)
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
LOG_LEVEL=info
EOF
    echo "✅ Production environment file created"
    echo "⚠️  IMPORTANT: Save the generated passwords from .env.prod"
fi

# Start production services
echo "🐳 Starting production services..."
docker-compose -f docker-compose.prod.yml --env-file .env.prod up -d

# Wait for services
echo "⏳ Waiting for services to start..."
sleep 30

# Health check
echo "🏥 Performing health checks..."
for service in "localhost:3000" "localhost:3001" "localhost:3002" "localhost:3003"; do
    if curl -f http://$service/health > /dev/null 2>&1; then
        echo "✅ $service is healthy"
    else
        echo "❌ $service is not responding"
    fi
done

echo "✅ Production deployment completed!"
echo "🌐 API is available at http://localhost:3000"

# scripts/test-api.sh
#!/bin/bash

set -e

API_URL="http://localhost:3000"

echo "🧪 Testing Math Arena API..."

# Test health endpoint
echo "📊 Testing health endpoint..."
curl -s "$API_URL/health" | jq .

# Register a test user
echo "👤 Registering test user..."
REGISTER_RESPONSE=$(curl -s -X POST "$API_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "username": "testuser123",
    "password": "testpass123"
  }')

echo $REGISTER_RESPONSE | jq .

# Extract token
TOKEN=$(echo $REGISTER_RESPONSE | jq -r '.data.access_token')

if [ "$TOKEN" = "null" ]; then
    echo "❌ Failed to register user"
    exit 1
fi

echo "✅ User registered successfully"

# Start a game
echo "🎮 Starting a game..."
GAME_RESPONSE=$(curl -s -X POST "$API_URL/game/start" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "Test User",
    "difficulty": 2
  }')

echo $GAME_RESPONSE | jq .

# Extract game ID
GAME_ID=$(echo $GAME_RESPONSE | jq -r '.data.gameId')

if [ "$GAME_ID" = "null" ]; then
    echo "❌ Failed to start game"
    exit 1
fi

echo "✅ Game started successfully with ID: $GAME_ID"

# Submit an answer
echo "📝 Submitting an answer..."
ANSWER_RESPONSE=$(curl -s -X POST "$API_URL/game/$GAME_ID/submit" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "answer": 42
  }')

echo $ANSWER_RESPONSE | jq .

# Get player results
echo "📊 Getting player results..."
curl -s -X GET "$API_URL/result/me/$GAME_ID" \
  -H "Authorization: Bearer $TOKEN" | jq .

# End the game
echo "🏁 Ending the game..."
curl -s -X GET "$API_URL/game/$GAME_ID/end" \
  -H "Authorization: Bearer $TOKEN" | jq .

echo "✅ API test completed successfully!"

# scripts/monitor.sh
#!/bin/bash

echo "📊 Math Arena System Monitor"
echo "=========================="

while true; do
    clear
    echo "📊 Math Arena System Monitor - $(date)"
    echo "=========================="
    echo ""

    # Service health checks
    echo "🏥 Service Health:"
    for service in "Orchestrator:3000" "Auth:3001" "Game:3002" "Players:3003"; do
        name=$(echo $service | cut -d: -f1)
        port=$(echo $service | cut -d: -f2)

        if curl -f http://localhost:$port/health > /dev/null 2>&1; then
            echo "  ✅ $name Service (Port $port)"
        else
            echo "  ❌ $name Service (Port $port)"
        fi
    done

    echo ""

    # Docker container status
    echo "🐳 Docker Containers:"
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep math-arena || echo "  No containers running"

    echo ""

    # System resources
    echo "💾 System Resources:"
    echo "  Memory: $(free -h | awk '/^Mem:/ {print $3 "/" $2}')"
    echo "  Disk: $(df -h / | awk 'NR==2 {print $3 "/" $2 " (" $5 " used)"}')"

    echo ""
    echo "Press Ctrl+C to stop monitoring..."
    sleep 5
done

# Makefile
.PHONY: setup start stop test clean deploy monitor

# Development commands
setup:
	@chmod +x scripts/setup.sh
	@./scripts/setup.sh

start:
	@npm start

stop:
	@docker-compose down
	@pkill -f "node services"

test:
	@npm test

test-api:
	@chmod +x scripts/test-api.sh
	@./scripts/test-api.sh

# Docker commands
docker-up:
	@docker-compose up -d

docker-down:
	@docker-compose down

docker-logs:
	@docker-compose logs -f

# Production commands
deploy:
	@chmod +x scripts/deploy.sh
	@./scripts/deploy.sh

deploy-prod:
	@docker-compose -f docker-compose.prod.yml up -d

# Monitoring
monitor:
	@chmod +x scripts/monitor.sh
	@./scripts/monitor.sh

# Maintenance
clean:
	@docker-compose down -v
	@docker system prune -f
	@rm -rf node_modules
	@rm -rf logs/*

logs:
	@tail -f logs/combined.log

health:
	@curl -s http://localhost:3000/health | jq .

# Database
db-shell:
	@docker exec -it math-arena-mongodb mongosh math-arena

db-backup:
	@docker exec math-arena-mongodb mongodump --out /tmp/backup
	@docker cp math-arena-mongodb:/tmp/backup ./backup-$(shell date +%Y%m%d-%H%M%S)

# Development helpers
dev:
	@npm run dev

install:
	@npm install

lint:
	@npm run lint

lint-fix:
	@npm run lint:fix