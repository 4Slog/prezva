# Prezva — Event Management SaaS
# Project-Level Claude Code Instructions
# Read this file fully before doing anything in this project.
# Also read: ~/Prezva/dev/session-notes.md for current task state.

---

## What Prezva Is
A full-featured event management SaaS platform — a Whova competitor built for associations,
small businesses, and event organizers. Pronounced like "Prezva."
- External-facing SaaS, multi-tenant, white-labelable
- Stack: Next.js 16.2.6 + TypeScript + Tailwind CSS + Supabase + Stripe Connect + Trigger.dev
- Mobile: React Native (Expo) — Phase 2
- AI features: Anthropic Claude API — Phase 2
- Live at: https://prezva.app

---

## Business Model
- Organizer pays Prezva a flat SaaS fee (monthly or per-event) — handled outside ticket flow
- Organizer connects their OWN existing Stripe account via Connect Onboarding
- Attendee pays ticket price → 100% goes directly to organizer's Stripe account
- Prezva NEVER touches ticket money — zero platform fee on transactions
- Prezva records payment confirmation via Stripe webhook

---

## Machine Context
- This code runs on lin (casa — Ubuntu 24.04, casadesowu.com)
- Dev server: port 3100 (`npm run dev -- -p 3100`)
- Mac is browser-only — view at http://10.0.0.60:3100
- Never write files outside ~/Prezva/dev/ unless explicitly instructed

---

## Infrastructure
- Supabase project: jmhxyyrleipcorvkmxfk (ONE project — no staging)
- Supabase custom domain: auth.prezva.app (NEXT_PUBLIC_SUPABASE_URL=https://auth.prezva.app)
- Vercel project: prezva (auto-deploys main → prezva.app)
- GitHub: github.com/4Slog/prezva (private)
- Trigger.dev: project ref = prezva
- Stripe: Express accounts via Connect Onboarding (NOT OAuth — OAuth is deprecated)

---

## Supabase Critical Rules
- ONE production project — jmhxyyrleipcorvkmxfk — no separate staging
- ALWAYS enable RLS on every new table immediately after creation
- Migration naming: 0037_description.sql (next after 0036)
- Use createAdminClient() for: webhooks, cron jobs, GDPR routes, any server-side without user session
- Use createClient() for: user-facing server actions, authenticated routes
- NEVER use createClient() in webhook handlers — auth.uid() returns null, RLS blocks updates silently

---

## Stripe Connect Rules
- Uses Express accounts via stripe.accountLinks.create() — NOT oauth/authorize
- startConnectOnboarding() creates Express account + returns account link URL
- Checkout uses stripeAccount header — money goes direct to organizer, never through Prezva
- disconnectConnectAccount() clears charges_enabled/payouts_enabled only — NEVER calls stripe.accounts.del()
- STRIPE_CLIENT_ID env var exists but is no longer used (OAuth deprecated)

---

## Critical Client Rules
- createAdminClient() — bypasses RLS, use for webhooks/cron/admin operations
- createClient() — user session, use for authenticated user actions
- NEVER mix these up — wrong client = silent data corruption in webhook context

---

## After Every Code Change (MANDATORY)
1. npm run build — must be clean, zero errors
2. npx vitest run — all 318 tests must pass
3. npx tsc --noEmit — zero src/ errors
Report results before saying task is done. If any fail: fix before moving on.

---

## Git & Deployment
- main branch → auto-deploys to prezva.app via Vercel
- Branch per bundle: bundle5-background-jobs, bundle6-storage, etc.
- Never push directly to main — always PR
- Conventional commits: feat: | fix: | chore: | docs: | test: | perf:
- Commit after EVERY task — not at end of bundle
- Current migrations: 0001–0036 exist. Next migration: 0037_xxx.sql

---

## Code Style
- TypeScript strict mode — minimize (as any) casts, annotate when unavoidable
- Named exports preferred over default exports
- File naming: kebab-case for files, PascalCase for components
- Tailwind CSS only — no custom CSS files
- Zod for all input validation
- No prompt() or alert() — use state-driven modals

---

## Testing
- Unit tests: Vitest — src/__tests__/ — 318 tests across 22 files
- E2E tests: Playwright — e2e/ (minimal coverage, needs expansion)
- Every new API route needs a test case
- Run: npx vitest run

---

## Session Protocol
- Start every session: read session-notes.md first
- End every session: update session-notes.md with decisions + next action
- Batch related changes — no 5-message follow-up chains
- No thank-you messages — wastes tokens

---

## Key File Locations
- Stripe Connect: src/lib/connect/actions.ts
- Stripe Checkout: src/lib/stripe/checkout.ts
- Stripe Webhook: src/app/api/webhooks/stripe/route.ts
- GDPR: src/app/api/gdpr/delete/route.ts + export/route.ts
- Integrations: src/lib/integrations/ (_shared/, google-drive/, google-forms/, mailchimp/, etc.)
- Trigger.dev jobs: src/trigger/jobs/
- Trigger.dev helper: src/lib/trigger.ts
- Supabase clients: src/lib/supabase/server.ts | admin.ts | client.ts
- Production secrets doc: docs/production-secrets.md

---

## Completed Bundles (do not redo)
- Bundle 1: Env & Infrastructure (Permissions-Policy, INTEGRATION_ENCRYPTION_KEY, sw.js)
- Bundle 2: DB Migrations (0029–0035, audit log columns, RLS fixes)
- Bundle 3: Backend Wiring (webhook adminClient, GDPR delete, Mailchimp, stripe_session_id)
- Bundle 4: Stripe Connect (Express Onboarding, direct charges, disconnect preserves account)

---

## Memory & Docs
- Project memory: ~/.claude/global-memory/prezva_project.md
- Production secrets: ~/Prezva/dev/docs/production-secrets.md
- Build plan: ~/Prezva/docs/Prezva_Master_Build_Plan.docx
