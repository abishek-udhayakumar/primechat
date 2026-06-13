#!/bin/bash
# PrimeChat — Deployment Script
# Run this after deploying new code to apply database migrations.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "PrimeChat Deployment"
echo "===================="
echo ""

# Run migrations
echo "Running database migrations..."
php "$SCRIPT_DIR/migrate.php"

echo ""
echo "Deployment complete."
