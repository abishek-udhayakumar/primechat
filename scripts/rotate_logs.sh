#!/bin/bash
# PrimeChat — Log Rotation

LOG_DIR="$(dirname "$0")/../logs"
ARCHIVE_DIR="$LOG_DIR/archive"
TIMESTAMP=$(date +"%Y%m%d")

mkdir -p "$ARCHIVE_DIR"

echo "🔄 Rotating logs in $LOG_DIR..."

# Compress and move logs older than 1 day (excluding current date logs)
find "$LOG_DIR" -maxdepth 1 -name "*.log" -type f -not -name "$(date +"%Y-%m-%d").log" -not -name "alerts.log" -exec gzip {} \; -exec mv {}.gz "$ARCHIVE_DIR/" \;

# Keep alerts.log but truncate if too large (> 10MB)
MAX_SIZE=10485760
if [ -f "$LOG_DIR/alerts.log" ]; then
    SIZE=$(stat -c%s "$LOG_DIR/alerts.log")
    if [ $SIZE -gt $MAX_SIZE ]; then
        mv "$LOG_DIR/alerts.log" "$ARCHIVE_DIR/alerts_$TIMESTAMP.log"
        gzip "$ARCHIVE_DIR/alerts_$TIMESTAMP.log"
        touch "$LOG_DIR/alerts.log"
    fi
fi

# Prune archives older than 30 days
find "$ARCHIVE_DIR" -type f -mtime +30 -delete

echo "✅ Log rotation complete."
