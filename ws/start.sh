#!/bin/bash
# PrimeChat WebSocket Server — startup script
# Usage: ./ws/start.sh [port]
# Default port: 8080

PORT=${1:-8080}
DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== PrimeChat WebSocket Server ==="
echo "Working directory: $DIR"
echo "Port: $PORT"

# Check if PHP is available
if ! command -v php &> /dev/null; then
    echo "ERROR: PHP not found"
    exit 1
fi

# Start the WebSocket server
php "$DIR/ws/server.php" "$PORT"
