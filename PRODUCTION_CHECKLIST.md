# Prezva Production Launch Checklist

## P0 — Must complete before ANY production testing

### 1. Resend domain verification
- [ ] Login to resend.com > Domains > Add prezva.app
- [ ] Add SPF record: TXT on prezva.app: "v=spf1 include:_spf.resend.com ~all"
- [ ] Add DKIM record: CNAME (Resend provides exact record)
- [ ] Add DMARC record: TXT on _dmarc.prezva.app: "v=DMARC1; p=quarantine"
- [ ] Verify domain shows green in Resend dashboard
- [ ] Send test email and confirm delivery

### 2. Stripe Connect platform profile
- [ ] dashboard.stripe.com > Connect > Settings
- [ ] Complete: business name (4S Logistics LLC), website (prezva.app), support email
- [ ] Verify paid ticket registration works in test mode

### 3. Supabase storage buckets
- [ ] Supabase dashboard > SQL editor > run supabase/storage-buckets.sql
- [ ] Verify buckets: org-logos, speaker-photos, handouts, badges, certificates, event-covers, avatars
- [ ] Test org logo upload

### 4. Environment variables in Vercel dashboard
- [ ] RESEND_API_KEY
- [ ] STRIPE_SECRET_KEY
- [ ] STRIPE_PUBLISHABLE_KEY
- [ ] STRIPE_WEBHOOK_SECRET
- [ ] NEXT_PUBLIC_VAPID_PUBLIC_KEY (generate: npx web-push generate-vapid-keys)
- [ ] VAPID_PRIVATE_KEY (same command)
- [ ] VAPID_EMAIL=mailto:hello@prezva.app
- [ ] INTEGRATION_ENCRYPTION_KEY (generate: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
- [ ] ADMIN_EMAILS
- [ ] SUPER_ADMIN_IDS (your Supabase user ID from Auth dashboard)
- [ ] NEXT_PUBLIC_APP_URL=https://prezva.app

### 5. Trigger.dev production deployment
- [ ] trigger.dev dashboard > verify all jobs showing in production
- [ ] Trigger a test job manually
- [ ] Confirm TRIGGER_SECRET_KEY matches Vercel env var

### 6. Stripe webhook endpoint
- [ ] Stripe > Developers > Webhooks > Add endpoint: https://prezva.app/api/webhooks/stripe
- [ ] Events: checkout.session.completed, checkout.session.expired, payment_intent.payment_failed, account.updated
- [ ] Enable Events from Connected accounts
- [ ] Copy signing secret to STRIPE_WEBHOOK_SECRET in Vercel

### 7. Database reset before launch
- [ ] Delete all test data (keep sowu.paul@gmail.com account only)
- [ ] Run smoke test: login, create event, register, check in, view analytics

## P1 — Before public launch
- [ ] All 12 persona clickthrough tests pass
- [ ] Email delivery confirmed (Resend domain verified)
- [ ] Payment flow tested end-to-end in Stripe test mode
- [ ] Offline QR check-in tested on real device
- [ ] Reference Prezva_Complete_Test_Suite_Report.docx for full 287-item test plan
