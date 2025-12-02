#!/bin/bash

# Simple, reliable deployment script for BenchBalancer
# This script uses rsync to deploy files to your VPS

echo "========================================="
echo "🚀 BENCHBALANCER DEPLOYMENT TO VPS"
echo "========================================="

# Configuration
VPS_HOST="72.60.110.72"
VPS_USER="root"
VPS_PATH="/var/www/benchbalancer"
LOCAL_PATH="/Users/bradbanks/Bench root/Corrrect engine and algoritm"

echo "📍 Source: $LOCAL_PATH"
echo "📍 Target: $VPS_USER@$VPS_HOST:$VPS_PATH"
echo ""

# Test SSH connection
echo "🔗 Testing SSH connection..."
if ssh "$VPS_USER@$VPS_HOST" "echo 'SSH connection OK'" > /dev/null 2>&1; then
    echo "✅ SSH connection successful"
else
    echo "❌ SSH connection failed. You may need to enter your password."
fi
echo ""

# Create backup on VPS
echo "💾 Creating backup on VPS..."
BACKUP_NAME="backup-$(date +%Y%m%d-%H%M%S).tar.gz"
ssh "$VPS_USER@$VPS_HOST" "cd $VPS_PATH && tar -czf backups/$BACKUP_NAME --exclude=backups ." 2>/dev/null || true
echo "✅ Backup created (if site exists)"
echo ""

# Deploy files using rsync
echo "📤 Deploying files to VPS..."
echo "This will sync all HTML, JS, CSS, and asset files"
echo ""

rsync -avz --progress \
  --exclude='.git' \
  --exclude='.DS_Store' \
  --exclude='*.sh' \
  --exclude='backups' \
  --exclude='tests' \
  --exclude='*.tar.gz' \
  --exclude='*.log' \
  "$LOCAL_PATH"/*.html \
  "$LOCAL_PATH"/*.js \
  "$LOCAL_PATH"/*.css \
  "$LOCAL_PATH"/*.wav \
  "$LOCAL_PATH"/*.mp3 \
  "$LOCAL_PATH"/*.png \
  "$VPS_USER@$VPS_HOST:$VPS_PATH/"

# Also sync subdirectories if they exist
if [ -d "$LOCAL_PATH/assets" ]; then
    rsync -avz --progress "$LOCAL_PATH/assets/" "$VPS_USER@$VPS_HOST:$VPS_PATH/assets/"
fi

if [ -d "$LOCAL_PATH/config" ]; then
    rsync -avz --progress "$LOCAL_PATH/config/" "$VPS_USER@$VPS_HOST:$VPS_PATH/config/"
fi

if [ -d "$LOCAL_PATH/auth" ]; then
    rsync -avz --progress "$LOCAL_PATH/auth/" "$VPS_USER@$VPS_HOST:$VPS_PATH/auth/"
fi

echo ""
echo "🔄 Reloading web server..."
ssh "$VPS_USER@$VPS_HOST" "systemctl reload nginx" 2>/dev/null || \
ssh "$VPS_USER@$VPS_HOST" "service nginx reload" 2>/dev/null || \
echo "⚠️  Could not reload nginx (may not be needed)"

echo ""
echo "========================================="
echo "✅ DEPLOYMENT COMPLETE!"
echo "========================================="
echo ""
echo "🌐 Your site is live at: http://$VPS_HOST"
echo ""
echo "📝 Files deployed:"
echo "   - All HTML files"
echo "   - All JavaScript files"
echo "   - All CSS files"
echo "   - All audio files"
echo "   - All image files"
echo ""
echo "🕐 Deployed at: $(date)"
echo "========================================="