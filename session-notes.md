# Prezva — Session Notes
# Read this at the START of every build session before doing anything.
# Update this at the END of every build session.

---

## Current Phase
**Phase 1 — Sprint 2 (Integration Test Gate)**

Sprint 1 is COMPLETE as of May 10 2026.
- 20 P0 code edits applied, migration 0003 merged, all 3 broken planner pages confirmed loading in browser
- Merged to main (commit 93328a1), pushed to origin
- Tests: 189/189 | Build: PASS | Playwright MCP available

Full audit saved at: `~/Prezva/audit/phase1-audit-save.md`

### Sprint 2 goal
Replace mocked DB tests with real Supabase integration tests so schema bugs surface at test time (not in prod).
Unit tests mock the DB — that's why 7 P0 bugs existed despite 189 passing tests.

### Resume point — next session (Sprint 2)
1. Read `~/Prezva/audit/phase1-audit-save.md` §"Sprint 2" for full scope
2. Create branch `sprint2-integration-tests`
3. Write real-DB integration tests (Vitest + supabase-js against staging project)
4. Gate: all integration tests green before merging to main

### Notes
- Playwright MCP: `npx @playwright/mcp@latest --browser chrome --headless` — configured in ~/.claude.json
- Demo seed live on prezva.app (civitas org / birmingham-sbw-2026) — DO NOT wipe until Sprint 2 verified
- Staging Supabase: credentials in ~/.claude/global-memory/credentials.md

### Demo seed data live on prezva.app
- Owner: demo.owner@prezva-audit.test / AuditDemo2026!
- Org: civitas | Event: birmingham-sbw-2026
- DO NOT wipe until Sprint 1 walkthrough is verified

## Last Session
Date: May 9 2026

## Completed This Session
### Pre-Build Foundation ✅
### Phase 1 Schema ✅ (0001_initial_schema.sql — 23 tables)
### Phase 1 RLS ✅ (0002_rls.sql — 75 policies, 4 helper functions)
### Task 21 — CI/CD Gate ✅
### Task 22 — Auth Module ✅ (82/82 tests, CI green)
### Rename: Xekin → Prezva ✅
- GitHub: 4Slog/prezva
- Vercel project: prezva
- Supabase project display: prezva (ID unchanged)
- Lin folder: ~/Prezva/
- prezva.app DNS → Vercel (A: 76.76.21.21)
- prezva.com → 301 redirect to prezva.app
- All source files, scripts, docs updated

## Locked Decisions
- ALL code on lin ~/Prezva/dev/ — Mac is browser only (http://10.0.0.60:3100)
- Auth pages: useActionState (client components)
- redirect() uses plain strings — typedRoutes disabled
- Lint: eslint src/ --ext .ts,.tsx --max-warnings 0
- Write SQL/files via paramiko SFTP — never bash heredoc (PID contamination)
- DB push URL: postgresql://postgres:ERg%2A%3FZ6grtE5nH%24@db.jmhxyyrleipcorvkmxfk.supabase.co:5432/postgres
- After new pages: npm run build FIRST, then npm run type-check

## Task 24 — Orgs (Next)
1. POST /api/orgs — create org + auto-add creator as owner in org_members
2. GET /api/orgs — list authenticated user's orgs
3. PATCH /api/orgs/[id] — update settings (owner only)
4. POST /api/orgs/[id]/invite — send email invite, create pending org_members row
5. Org switcher component (dropdown in nav header)
6. /dashboard/settings page (org profile edit)
7. Tests + gate check

## Upcoming Tasks (Phase 1)
25 → Events | 28 → Tickets | 33 → Registration+Stripe | 38 → Attendees
47 → QR Check-in (offline-first) | 62 → Agenda | 68 → Speakers
72 → Attendee web app | 78 → Announcements | 83 → Messaging
87 → Surveys | 91 → Analytics | 97 → Phase 1 system tests + gate

## Audit Gaps to Add (from Master Plan Audit review)
- Background job queue (Trigger.dev/Inngest) — add before Task 33 Registration
- Database seed script (Faker.js) — add before testing at scale
- i18n foundation (next-intl) — add during Phase 1 Polish

## Validation Status
Last: May 9 2026 — 45 PASS, 1 WARN (dev server not running), 0 FAIL
Tests: 82/82 passing
CI: green ✅ | Vercel: prezva.app live ✅

## Task 24 — Organizations — COMPLETE ✅ (May 9 2026)

### Files created (11)
- src/lib/orgs/actions.ts — createOrg, updateOrg, inviteMember, removeMember, acceptInvite, getUserOrgs, getOrgBySlug
- src/app/api/orgs/route.ts — POST (create) + GET (list)
- src/app/api/orgs/[id]/route.ts — GET + PATCH
- src/app/api/orgs/[id]/invite/route.ts — POST invite
- src/app/api/orgs/[id]/members/route.ts — GET members
- src/components/orgs/OrgSwitcher.tsx
- src/components/orgs/InviteForm.tsx
- src/components/orgs/MemberList.tsx
- src/app/(dashboard)/orgs/new/page.tsx
- src/app/(dashboard)/orgs/[slug]/settings/page.tsx
- src/__tests__/orgs.test.ts (12 tests)

### Test totals: 94/94 passing
### Build validator: 12 PASS / 0 WARN / 0 FAIL
### Commit: 8446469 — pushed to main, Vercel deploying

### Notes
- Zod v4 uses .issues[0].message not .errors[0].message
- vi.clearAllMocks() resets mockResolvedValue — use mockReset + re-install in beforeEach
- mockFrom needs full chain shape for TypeScript even in conditional branches

### Next: Task 25 — Org-level roles enforcement (owner/admin/staff gates on event creation)
   OR skip to Task 28 — Events module (create event, lifecycle, settings)
   Ask Paul which to tackle next.

## Branding Sprint — COMPLETE ✅ (May 9 2026)

### Design assets stored on lin
- ~/Prezva/design/mockups/organizer-dashboard.png (6.4MB — Gemini concept)
- ~/Prezva/design/mockups/attendee-qr-mobile.png (1.8MB — Gemini concept)
- ~/Prezva/design/brand/design-tokens.md — full token documentation

### Files changed in codebase
- src/app/globals.css — full Prezva token system (15 color vars, 8 utility classes, shadcn var mapping)
- src/lib/brand.ts — BRAND constants for JS/TS (colors, typography, radius)
- src/app/layout.tsx — proper metadata (title template, OG, twitter, themeColor)
- src/app/(dashboard)/layout.tsx — branded sidebar (navy/teal, Offline Sync Health indicator)
- src/app/(dashboard)/dashboard/page.tsx — stat card shells + empty state

### Design direction locked
- Palette: deep navy (#0D1B2A) + teal (#00BFA6) — unclaimed in event tech category
- Font: Geist (already in stack)
- Offline Sync Health indicator is a signature brand element — keep always visible
- Mockup UI patterns captured in design-tokens.md

### Commit: 779cb35

### Next: Task 28 — Events module

## Session — May 9 2026 (continued)

### Task 28 — Events module — COMPLETE ✅
- POST/GET /api/events, GET/PATCH/DELETE /api/events/[id]
- lib/events/actions.ts (6 actions), EventStatusBadge, EventCard, EventStatusActions
- /events list, /events/new, /events/[slug], /events/[slug]/settings
- Status lifecycle: draft→published→live→ended→archived (+cancelled)
- 12 tests added — 106/106 total
- Commit: a0be1cd

### Trigger.dev v4 — COMPLETE ✅
- SDK: @trigger.dev/sdk v4.4.5
- trigger.config.ts at project root
- src/trigger/jobs/registration.ts — send-registration-confirmation + process-waitlist
- src/lib/trigger.ts — safe enqueue helpers
- TRIGGER_SECRET_KEY set on lin + Vercel
- Commit: 859b5c2

### Stripe + Webhook — COMPLETE ✅
- Restricted key (prezva-phase1) set on lin + Vercel
- Webhook endpoint: we_1TVF9cGMRrqkotYjT37T9tP9 → https://prezva.app/api/webhooks/stripe
- Events: payment_intent.succeeded/failed, checkout.session.completed/expired
- All 3 Stripe vars set: SECRET_KEY, PUBLISHABLE_KEY, WEBHOOK_SECRET
- NOTE: using live restricted key — use test card 4242 4242 4242 4242 for testing

### Audit warning (known, safe)
- 4 high vulns in @trigger.dev/sdk internals (socket.io, opentelemetry)
- No fix without --force; upstream issue; not in our code path

### Next: Task 33 — Registration & Ticketing
- Ticket types (free/paid/donation) CRUD
- Stripe Checkout session creation
- /api/webhooks/stripe handler (payment confirmation → registration)
- Registration flow (attendee form → payment → QR generation → email via Trigger.dev)
- Discount codes
- No-oversell capacity enforcement
- Offline queue for check-in

## Session — May 9 2026 (afternoon continued)

### Stripe Connect Express — COMPLETE ✅ (commit 7b048a9)
- Direct charges model, ticketing industry, Stripe-hosted onboarding
- Money flow: attendee pays → 100% to event planner bank → Prezva takes /bin/sh
- lib/connect/actions.ts — create/retrieve account, onboarding link, login link, status, disconnect
- api/connect/onboard + callback + status routes
- ConnectBankButton component (live status: not_connected/pending/restricted/active)
- Org settings page updated with Payments section
- Stripe checkout updated: transfer_data routes to connected account
- Registration blocks paid tickets if no connected account
- Webhook handles account.updated + account.application.deauthorized
- Paul's Stripe account fully verified: charges_enabled=true, payouts_enabled=true

### Landing page — COMPLETE ✅ (commit f60725d)
- Replaced default Next.js placeholder
- Hero, feature strip, offline-first callout, nav, footer
- Full brand tokens
- Live at prezva.app

### Current state
- Tests: 119/119 passing
- Validator: 11 PASS / 1 WARN / 0 FAIL
- prezva.app live with real landing page
- Full flow works: signup → org → connect bank → event → ticket → register → pay → confirmation

### Next: Task 38 — Attendees module
- Attendee list with search/filter
- CSV import/export
- Attendee detail page
- Manual add attendee
- Segments/tags
