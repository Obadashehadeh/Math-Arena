#!/bin/bash

# scripts/monitor.sh
echo "📊 Math Arena System Monitor"
echo "=========================="

# Check if required commands exist
command -v curl >/dev/null 2>&1 || { echo "❌ curl is required but not installed." >&2; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "⚠️  docker not found - container monitoring disabled"; }

# Function to check service health
check_service_health() {
    local service_name=$1
    local port=$2
    local url="http://localhost:$port/health"

    if curl -f -s "$url" > /dev/null 2>&1; then
        local response=$(curl -s "$url")
        local status=$(echo "$response" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
        if [ "$status" = "healthy" ]; then
            echo "  ✅ $service_name Service (Port $port) - HEALTHY"
        else
            echo "  ⚠️  $service_name Service (Port $port) - UNHEALTHY"
        fi
    else
        echo "  ❌ $service_name Service (Port $port) - DOWN"
    fi
}

# Function to get container status
get_container_status() {
    if command -v docker >/dev/null 2>&1; then
        echo ""
        echo "🐳 Docker Containers:"
        if docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -q math-arena; then
            docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep math-arena
        else
            echo "  No Math Arena containers running"
        fi
    fi
}

# Function to get system resources
get_system_resources() {
    echo ""
    echo "💾 System Resources:"

    # Memory usage
    if command -v free >/dev/null 2>&1; then
        local memory_info=$(free -h | awk '/^Mem:/ {print $3 "/" $2 " (" int($3/$2 * 100) "%)"}')
        echo "  Memory: $memory_info"
    fi

    # Disk usage
    if command -v df >/dev/null 2>&1; then
        local disk_info=$(df -h / | awk 'NR==2 {print $3 "/" $2 " (" $5 " used)"}')
        echo "  Disk: $disk_info"
    fi

    # Load average
    if [ -f /proc/loadavg ]; then
        local load_avg=$(cat /proc/loadavg | awk '{print $1, $2, $3}')
        echo "  Load Average: $load_avg"
    fi

    # CPU usage (if available)
    if command -v top >/dev/null 2>&1; then
        local cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | sed 's/%us,//')
        if [ ! -z "$cpu_usage" ]; then
            echo "  CPU Usage: $cpu_usage"
        fi
    fi
}

# Function to check database connectivity
check_database() {
    echo ""
    echo "🗄️  Database Status:"

    # Check MongoDB
    if command -v mongosh >/dev/null 2>&1; then
        if mongosh --eval "db.adminCommand('ping')" --quiet > /dev/null 2>&1; then
            echo "  ✅ MongoDB - Connected"
        else
            echo "  ❌ MongoDB - Not accessible"
        fi
    elif command -v docker >/dev/null 2>&1; then
        if docker exec math-arena-mongodb mongosh --eval "db.adminCommand('ping')" --quiet > /dev/null 2>&1; then
            echo "  ✅ MongoDB (Docker) - Connected"
        else
            echo "  ❌ MongoDB (Docker) - Not accessible"
        fi
    else
        echo "  ⚠️  MongoDB - Cannot check (no mongo client)"
    fi
}

# Function to check RabbitMQ
check_rabbitmq() {
    echo ""
    echo "🐰 RabbitMQ Status:"

    # Check RabbitMQ Management API
    if curl -f -s "http://localhost:15672/api/overview" > /dev/null 2>&1; then
        echo "  ✅ RabbitMQ Management - Accessible"

        # Get queue information
        local queue_info=$(curl -s "http://localhost:15672/api/queues" 2>/dev/null)
        if [ ! -z "$queue_info" ]; then
            echo "  📊 Queues: $(echo "$queue_info" | grep -o '"name"' | wc -l) total"
        fi
    else
        echo "  ❌ RabbitMQ Management - Not accessible"
    fi
}

# Function to show recent logs
show_recent_logs() {
    echo ""
    echo "📝 Recent Logs (last 5 lines):"

    if [ -f "logs/combined.log" ]; then
        echo "  Application Logs:"
        tail -5 logs/combined.log | sed 's/^/    /'
    elif command -v docker >/dev/null 2>&1; then
        echo "  Container Logs (Orchestrator):"
        docker logs math-arena-orchestrator --tail 3 2>/dev/null | sed 's/^/    /' || echo "    No logs available"
    else
        echo "    No logs available"
    fi
}

# Main monitoring loop
monitor_once() {
    clear
    echo "📊 Math Arena System Monitor - $(date)"
    echo "=========================="

    echo ""
    echo "🏥 Service Health:"
    check_service_health "Orchestrator" "3000"
    check_service_health "Auth" "3001"
    check_service_health "Game" "3002"
    check_service_health "Players" "3003"

    get_container_status
    get_system_resources
    check_database
    check_rabbitmq
    show_recent_logs

    echo ""
    echo "🔄 Last updated: $(date)"
    echo "Press Ctrl+C to stop monitoring..."
}

# Check if running in continuous mode
if [ "$1" = "--continuous" ] || [ "$1" = "-c" ]; then
    echo "🔄 Starting continuous monitoring (updates every 10 seconds)"
    echo "Press Ctrl+C to stop..."

    while true; do
        monitor_once
        sleep 10
    done
else
    monitor_once
    echo ""
    echo "💡 Tip: Use '$0 --continuous' for live monitoring"
fi