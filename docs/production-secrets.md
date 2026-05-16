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

## Stripe Connect
STRIPE_SECRET_KEY must be sk_live_... (full secret key).
rk_live_... is a restricted key and cannot create Connect accounts or Account Links.
Fixed in Vercel on May 15 2026.

STRIPE_CLIENT_ID is the Connect platform OAuth client ID.
Find it at: dashboard.stripe.com/settings/connect
Add to Vercel as STRIPE_CLIENT_ID when you complete Stripe Connect platform profile setup.

Verify Connect is working end-to-end:
1. Go to prezva.app, log in, go to org settings
2. Click "Connect bank account"
3. Should redirect to Stripe Connect Express onboarding (not show an error)

## Supabase Custom Domain
auth.prezva.app is the custom auth domain — activated May 16 2026.
NEXT_PUBLIC_SUPABASE_URL must be https://auth.prezva.app (already set in Vercel).
SUPABASE_DB_URL stays as the raw postgres URL — that is NOT affected by the custom domain.

Google OAuth redirect URIs (both must exist in Google Cloud Console):
  https://auth.prezva.app/auth/v1/callback        ← new, uses custom domain
  https://jmhxyyrleipcorvkmxfk.supabase.co/auth/v1/callback  ← old, keep as fallback

Once custom domain is confirmed working in production, the old URI can be removed.
