#!/bin/bash

# BenchBalancer VPS Deployment Script
# Deploy to Hostinger VPS at 72.60.110.72

echo "======================================="
echo "BenchBalancer VPS Deployment"
echo "Target: 72.60.110.72"
echo "======================================="

# Step 1: Deploy to VPS using rsync
echo "\nDeploying files to VPS..."
echo "Target directory: /var/www/benchbalancer"

rsync -avz --progress \
  -e "ssh -o StrictHostKeyChecking=no" \
  --exclude .DS_Store \
  --exclude .claude \
  --exclude '*.md' \
  --exclude '*.tar.gz' \
  --exclude 'test*.js' \
  ./ root@72.60.110.72:/var/www/benchbalancer/

if [ $? -ne 0 ]; then
    echo "❌ Deployment failed! Check your SSH connection and credentials."
    exit 1
fi

echo "\n======================================="
echo "✅ Deployment Complete!"
echo "======================================="
echo "🌐 Your app is live at: http://72.60.110.72"
echo "🕰️ Deployed at: $(date)"
