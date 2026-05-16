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

## STRIPE_CLIENT_ID (Required for Connect)

The Connect platform client ID from: dashboard.stripe.com/settings/connect

Steps to get it:
1. Go to dashboard.stripe.com/settings/connect
2. Complete the platform profile if not done (business name, website, description)
3. Find "Client ID" under "Live mode credentials" — looks like: ca_XXXXXXXX
4. Add to Vercel: STRIPE_CLIENT_ID = ca_XXXXXXXX (all 3 environments)

Without STRIPE_CLIENT_ID:
- Organizers cannot connect bank accounts
- disconnect flow skips Stripe deauth (only clears DB)
- Connect health check will show: stripe_client_id_set: false

Verify Connect is fully operational:
  curl https://prezva.app/api/connect/health
  # Should return: {"stripe_key_type":"full_key_ok","stripe_client_id_set":true,"platform_account_accessible":true,"connect_ready":true}

## Supabase Custom Domain
auth.prezva.app is the custom auth domain — activated May 16 2026.
NEXT_PUBLIC_SUPABASE_URL must be https://auth.prezva.app (already set in Vercel).
SUPABASE_DB_URL stays as the raw postgres URL — that is NOT affected by the custom domain.

Google OAuth redirect URIs (both must exist in Google Cloud Console):
  https://auth.prezva.app/auth/v1/callback        ← new, uses custom domain
  https://jmhxyyrleipcorvkmxfk.supabase.co/auth/v1/callback  ← old, keep as fallback

Once custom domain is confirmed working in production, the old URI can be removed.

## Google OAuth Consent Screen — Configured May 16 2026
App name: Prezva
Support email: ssss.logistics.llc@gmail.com
App domain: https://prezva.app
Logo: uploaded (512x512 PNG, teal square with white arc mark)
Publishing status: Testing (submit for verification before public launch)

Authorized redirect URIs (in Google Cloud Console, project 1064124487557):
  https://prezva.app/auth/callback
  https://prezva.app/api/integrations/google/callback
  https://auth.prezva.app/auth/v1/callback
  https://jmhxyyrleipcorvkmxfk.supabase.co/auth/v1/callback  ← remove after custom domain confirmed

Scopes configured (non-sensitive, no verification required):
  openid
  .../auth/userinfo.email
  .../auth/userinfo.profile

What these give you from every Google sign-in:
  profiles.email       = Google account email
  profiles.full_name   = Google display name
  profiles.avatar_url  = Google profile photo URL (lh3.googleusercontent.com/...)
  All populated automatically via handle_new_user() trigger on auth.users INSERT.

Before public launch — submit app for Google verification:
  Required when app has 100+ users OR exits Testing status
  Go to: console.cloud.google.com/auth/overview?project=1064124487557
  Click Publish app then Prepare for verification

## Google OAuth — Integration Redirect URIs (added May 16 2026)
The Prezva Web OAuth client (project 1064124487557) has these redirect URIs:
  https://prezva.app/auth/callback                              ← sign-in
  https://prezva.app/api/integrations/google/callback           ← legacy (keep)
  https://auth.prezva.app/auth/v1/callback                      ← Supabase custom domain
  https://prezva.app/api/integrations/google_drive/callback     ← Google Drive integration
  https://prezva.app/api/integrations/google_forms/callback     ← Google Forms integration

If you add more Google integrations in future, add their callback URI here too:
  Pattern: https://prezva.app/api/integrations/{provider}/callback
  Where {provider} matches the PROVIDER constant in the adapter file.

Note: google_drive and google_forms both fall back to GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
since no provider-specific vars are set. This is intentional — see Bundle 1 B1-4.

## Stripe Webhook — Connected Account Events
Webhook: https://prezva.app/api/webhooks/stripe
Configured: May 16 2026
Events from: Connected accounts (set in Stripe Dashboard)
Webhook secret: in Vercel as STRIPE_WEBHOOK_SECRET
Required events: checkout.session.completed, checkout.session.expired,
payment_intent.payment_failed, account.updated, account.application.deauthorized
Without "Events from: Connected accounts" paid registrations will never be confirmed.

## Trigger.dev Production Key
The TRIGGER_SECRET_KEY in .env.local is a DEV key (tr_dev_...).
Production deployments need a LIVE key (tr_live_...).

Steps:
1. Go to cloud.trigger.dev -> your project -> API Keys
2. Create or copy the production key (tr_live_...)
3. Add to Vercel: TRIGGER_SECRET_KEY = tr_live_... (production + preview environments)
4. Add to GitHub: Settings -> Secrets -> Actions -> TRIGGER_SECRET_KEY = tr_live_...

Without the production key, jobs are deployed but run against the dev environment.
