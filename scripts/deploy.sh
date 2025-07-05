#!/bin/bash

# scripts/deploy.sh
set -e

echo "🚀 Deploying Math Arena to Production..."

# Check if required tools are installed
command -v docker >/dev/null 2>&1 || { echo "❌ Docker is required but not installed. Aborting." >&2; exit 1; }
command -v docker-compose >/dev/null 2>&1 || { echo "❌ Docker Compose is required but not installed. Aborting." >&2; exit 1; }

# Build Docker images
echo "🔨 Building Docker images..."
docker build -t math-arena:latest .

# Create production environment file if it doesn't exist
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
    echo "📄 Generated passwords:"
    echo "   MongoDB Root: $(grep MONGO_ROOT_PASSWORD .env.prod | cut -d'=' -f2)"
    echo "   MongoDB App: $(grep MONGO_PASSWORD .env.prod | cut -d'=' -f2)"
    echo "   RabbitMQ: $(grep RABBITMQ_PASSWORD .env.prod | cut -d'=' -f2)"
    echo "   JWT Secret: $(grep JWT_SECRET .env.prod | cut -d'=' -f2)"
    echo ""
    read -p "Press Enter to continue after saving these credentials..."
fi

# Stop existing containers if running
echo "🛑 Stopping existing containers..."
docker-compose -f docker-compose.prod.yml --env-file .env.prod down

# Start production services
echo "🐳 Starting production services..."
docker-compose -f docker-compose.prod.yml --env-file .env.prod up -d

# Wait for services to start
echo "⏳ Waiting for services to start..."
sleep 30

# Perform health checks
echo "🏥 Performing health checks..."
SERVICES=("localhost:3000" "localhost:3001" "localhost:3002" "localhost:3003")
ALL_HEALTHY=true

for service in "${SERVICES[@]}"; do
    if curl -f http://$service/health > /dev/null 2>&1; then
        echo "✅ $service is healthy"
    else
        echo "❌ $service is not responding"
        ALL_HEALTHY=false
    fi
done

if [ "$ALL_HEALTHY" = true ]; then
    echo ""
    echo "✅ Production deployment completed successfully!"
    echo "🌐 API is available at http://localhost:3000"
    echo "📊 RabbitMQ Management UI: http://localhost:15672"
    echo "🔍 MongoDB is running on localhost:27017"
    echo ""
    echo "📚 Available endpoints:"
    echo "   POST /auth/register"
    echo "   POST /auth/login"
    echo "   POST /game/start (Protected)"
    echo "   POST /game/:gameId/submit (Protected)"
    echo "   PUT /game/:gameId/join (Protected)"
    echo "   GET /game/:gameId/end (Protected)"
    echo "   GET /result/me/:gameId (Protected)"
    echo "   GET /player/all/:gameId (Protected)"
    echo ""
    echo "🔧 Useful commands:"
    echo "   docker-compose -f docker-compose.prod.yml logs -f    # View logs"
    echo "   docker-compose -f docker-compose.prod.yml down       # Stop services"
    echo "   curl http://localhost:3000/health                    # Check API health"
else
    echo ""
    echo "❌ Some services are not healthy. Check the logs:"
    echo "   docker-compose -f docker-compose.prod.yml logs"
    exit 1
fi