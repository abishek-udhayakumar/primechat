#!/bin/bash
# ================================================
#  PrimeChat V3 — Incremental Feature Deploy
#  Run from your terminal:
#    bash /home/prime/Documents/chat_app/deploy_v3.sh
# ================================================

set -e
SRC="/home/prime/Documents/chat_app"
DST="/var/www/html/primechat"

echo ""
echo "🚀 PrimeChat V3 — Deploying advanced features..."
echo ""

# Create new directories
sudo mkdir -p "$DST/api/upload"

# Deploy all changed/new files
FILES=(
    "public/js/offline.js"
    "public/js/search.js"
    "public/js/history.js"
    "public/js/analytics.js"
    "public/js/scheduler.js"
    "public/js/upload.js"
    "public/js/app.js"
    "public/js/messages.js"
    "public/js/chat.js"
    "public/sw.js"
    "public/css/v3-features.css"
    "views/chat.html"
    "api/auth/sessions.php"
    "api/upload/chunk.php"
)

echo "[1/3] Copying V3 files..."
for f in "${FILES[@]}"; do
    sudo cp "$SRC/$f" "$DST/$f" && echo "  ✓ $f" || echo "  ✗ FAILED: $f"
done

echo ""
echo "[2/3] Setting permissions..."
sudo chown -R www-data:www-data "$DST/public/js/offline.js" \
    "$DST/public/js/search.js" "$DST/public/js/history.js" \
    "$DST/public/js/analytics.js" "$DST/public/js/scheduler.js" \
    "$DST/public/js/upload.js" "$DST/public/js/app.js" \
    "$DST/public/js/messages.js" "$DST/public/js/chat.js" \
    "$DST/public/sw.js" "$DST/public/css/v3-features.css" \
    "$DST/views/chat.html" "$DST/api/auth/sessions.php" \
    "$DST/api/upload/chunk.php" 2>/dev/null || true

# Create temp upload directory
sudo mkdir -p "$DST/public/uploads/tmp"
sudo chown -R www-data:www-data "$DST/public/uploads/tmp"
sudo chmod -R 775 "$DST/public/uploads/tmp"

echo ""
echo "[3/3] Verifying..."
for f in "js/offline.js" "js/search.js" "sw.js" "css/v3-features.css"; do
    HTTP=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost/$f")
    if [ "$HTTP" = "200" ]; then
        echo "  ✓ /$f → $HTTP"
    else
        echo "  ✗ /$f → $HTTP"
    fi
done

echo ""
echo "✅ PrimeChat V3 deployed! Hard-refresh the browser (Ctrl+Shift+R)."
echo ""
