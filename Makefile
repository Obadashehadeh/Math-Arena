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
	@pkill -f "node services" || true

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

monitor-live:
	@chmod +x scripts/monitor.sh
	@./scripts/monitor.sh --continuous

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

# Help
help:
	@echo "Math Arena - Available Commands:"
	@echo ""
	@echo "Development:"
	@echo "  make setup      - Initial project setup"
	@echo "  make start      - Start all services"
	@echo "  make stop       - Stop all services"
	@echo "  make dev        - Start in development mode"
	@echo "  make test       - Run tests"
	@echo "  make test-api   - Test API endpoints"
	@echo ""
	@echo "Docker:"
	@echo "  make docker-up    - Start infrastructure"
	@echo "  make docker-down  - Stop infrastructure"
	@echo "  make docker-logs  - View container logs"
	@echo ""
	@echo "Production:"
	@echo "  make deploy       - Deploy to production"
	@echo "  make deploy-prod  - Start production containers"
	@echo ""
	@echo "Monitoring:"
	@echo "  make monitor      - System status check"
	@echo "  make monitor-live - Continuous monitoring"
	@echo "  make health       - Quick health check"
	@echo "  make logs         - View application logs"
	@echo ""
	@echo "Maintenance:"
	@echo "  make clean        - Clean up containers and files"
	@echo "  make db-shell     - Access MongoDB shell"
	@echo "  make db-backup    - Backup database"