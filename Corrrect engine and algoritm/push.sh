#!/bin/bash

echo "🚀 Pushing changes to VPS..."
rsync -avz "/Users/bradbanks/Bench root/Corrrect engine and algoritm/" root@72.60.110.72:/var/www/benchbalancer/
echo "✅ Done! Changes pushed to http://72.60.110.72"