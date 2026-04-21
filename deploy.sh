#!/bin/bash
# ========================================
#  PrimeChat — One-Shot Deploy Script
#  Run this in your terminal:
#    bash /home/prime/Documents/chat_app/deploy.sh
# ========================================

set -e  # Stop on first error

echo ""
echo "🚀 PrimeChat — Deploying..."
echo ""

# 1. Wipe old stale deployment
echo "[1/6] Removing old deployment..."
sudo rm -rf /var/www/html/primechat

# 2. Copy fresh source code
echo "[2/6] Copying project files..."
sudo cp -r /home/prime/Documents/chat_app /var/www/html/primechat

# 3. Fix ownership + permissions
echo "[3/6] Setting permissions..."
sudo chown -R www-data:www-data /var/www/html/primechat
sudo find /var/www/html/primechat -type d -exec chmod 755 {} \;
sudo find /var/www/html/primechat -type f -exec chmod 644 {} \;
sudo chmod -R 775 /var/www/html/primechat/public/uploads

# 4. Install Apache VHost
echo "[4/6] Installing Apache config..."
sudo cp /var/www/html/primechat/primechat.conf /etc/apache2/sites-available/004-primechat.conf
sudo a2dissite 000-default.conf 2>/dev/null || true
sudo a2ensite 004-primechat.conf 2>/dev/null || true

# 5. Test Apache config
echo "[5/6] Testing Apache config..."
sudo apache2ctl configtest

# 6. Restart Apache
echo "[6/6] Restarting Apache..."
sudo systemctl restart apache2

echo ""
echo "✅ DEPLOYED! Verifying..."
echo ""
echo "--- public/index.php ---"
ls -la /var/www/html/primechat/public/index.php
echo "--- public/.htaccess ---"
ls -la /var/www/html/primechat/public/.htaccess
echo "--- views/ ---"
ls -la /var/www/html/primechat/views/
echo "--- VHost enabled ---"
ls -la /etc/apache2/sites-enabled/
echo ""
echo "🎉 Done! Open http://localhost in your browser."
echo ""
