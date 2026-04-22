#!/bin/bash
# PrimeChat — Automated DB Backup

BACKUP_DIR="$(dirname "$0")/../backups"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
DB_NAME="primechat"
DB_USER="root"
DB_PASS="hacker@#007"

mkdir -p "$BACKUP_DIR"

echo "🚀 Starting backup for $DB_NAME..."
mysqldump -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" > "$BACKUP_DIR/${DB_NAME}_$TIMESTAMP.sql"

if [ $? -eq 0 ]; then
    echo "✅ Backup successful: ${DB_NAME}_$TIMESTAMP.sql"
    # Keep only last 7 days of backups
    find "$BACKUP_DIR" -type f -name "*.sql" -mtime +7 -delete
else
    echo "❌ Backup failed!"
    exit 1
fi
