#!/bin/bash
# Prezva Test Services Launcher
# Run this before any email or webhook testing sessions

echo "🚀 Starting Prezva test services..."

# 1. Mailpit (local SMTP + web UI for email testing)
echo "📧 Starting Mailpit..."
brew services start mailpit
echo "   Web UI: http://localhost:8025"
echo "   SMTP:   localhost:1025"

echo ""
echo "✅ Services started."
echo ""
echo "📋 Next steps:"
echo "   1. Start dev server:          cd /Users/wu/Prezva/dev && pnpm dev"
echo "   2. Start Stripe listener:     stripe listen --forward-to http://localhost:3000/api/webhooks/stripe"
echo "   3. Get webhook secret:        stripe listen --print-secret"
echo "   4. Open Mailpit UI:           open http://localhost:8025"
