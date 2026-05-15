# Production Secrets Reference

## INTEGRATION_ENCRYPTION_KEY
AES-256-GCM key for OAuth refresh token encryption in org_integrations table.
Generate: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
Add to Vercel: Settings -> Environment Variables -> all 3 environments (production, preview, development).
WARNING: Never rotate this key without first decrypting and re-encrypting all
org_integrations.encrypted_refresh_token values. Rotating without migration permanently
breaks all connected integrations.

## VAPID Push Keys
Keys are already set in Vercel. To regenerate if needed: npx web-push generate-vapid-keys
Vars in Vercel: VAPID_PRIVATE_KEY (encrypted), NEXT_PUBLIC_VAPID_PUBLIC_KEY (plain), VAPID_EMAIL (plain)
NEXT_PUBLIC_ vars require a full Vercel redeploy to take effect (baked in at build time).
Verify push is live: curl https://prezva.app/api/push/health

## Stripe Key
STRIPE_SECRET_KEY must be sk_live_... (full secret key).
rk_live_... is a restricted key and CANNOT create Connect accounts or generate Account Links.
Already fixed in Vercel by Paul on May 15 2026.
If it ever breaks again: Stripe Dashboard -> Developers -> API Keys -> Standard keys -> sk_live_
