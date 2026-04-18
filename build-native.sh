#!/bin/bash
# ═══════════════════════════════════════════════
# AllNet — Build script for Capacitor
# Copies web assets to www/ directory
# ═══════════════════════════════════════════════

set -e

echo "🏀 AllNet — Building for Capacitor..."

# Clean previous build
rm -rf www
mkdir -p www/css www/js www/img www/fonts

# Copy HTML pages (app pages only, not landing)
cp allnet-app.html www/
cp allnet-activity.html www/
cp allnet-career.html www/
cp allnet-phase2.html www/
cp allnet-stars.html www/
cp allnet-settings.html www/
cp allnet-player.html www/

# Create index.html entry point for Capacitor
cat > www/index.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="refresh" content="0;url=allnet-app.html">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<script>if(window.Capacitor){document.documentElement.classList.add('native');}</script>
<title>AllNet</title>
<style>html,body{background:#0A0A0A;margin:0;height:100%;}</style>
</head>
<body></body>
</html>
EOF

# Copy CSS
cp css/app.css www/css/
cp css/career-card.css www/css/
cp css/tour.css www/css/
cp css/native.css www/css/

# Copy JS
cp js/app.js www/js/
cp js/career-card.js www/js/
cp js/supabase-helpers.js www/js/
cp js/push-notifications.js www/js/
cp js/tour.js www/js/
cp js/posthog.js www/js/

# Copy images
cp -r img/* www/img/

# Copy fonts
cp -r fonts/* www/fonts/

# Copy manifest and other root files
cp manifest.json www/
cp service-worker.js www/
cp robots.txt www/

# Copy privacy and terms
cp privacy.html www/
cp terms.html www/
cp auth-callback.html www/

echo "✅ Build complete — www/ ready for cap sync"
echo ""
echo "Next steps:"
echo "  npx cap sync"
echo "  npx cap open ios     # or: npx cap open android"
