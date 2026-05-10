# Prezva — Session Notes
# Read this at the START of every build session before doing anything.
# Update this at the END of every build session.

---

## Current Phase
**Phase 1 — Sprint 3 COMPLETE (May 10 2026)**

Sprint 1, 2, and 3 all COMPLETE as of May 10 2026.

---

## Sprint 3 — COMPLETE ✅ (May 10 2026)
All 8 broken/stub features now work end-to-end.

| # | Feature | Files |
|---|---------|-------|
| 11 | Stripe `account.updated` → sync charges/payouts to org | src/app/api/webhooks/stripe/route.ts |
| 12 | CSV import RFC 4180 parser + crypto QR | src/lib/attendees/actions.ts |
| 13 | Realtime messaging (Supabase channel subscription) | src/app/(dashboard)/events/[slug]/networking/client.tsx |
| 14 | `/e/[slug]/my-qr` QR lookup page | src/app/e/[slug]/my-qr/{page,qr-display}.tsx |
| 15 | Waitlist Trigger.dev job (process-waitlist) | src/trigger/jobs/registration.ts |
| 16 | Announcements email delivery via Trigger.dev | src/trigger/jobs/announcement.ts, src/lib/trigger.ts |
| 17 | Member invite — token email + `/invite/[token]` accept | src/lib/orgs/actions.ts, src/app/invite/[token]/page.tsx, supabase/migrations/0004_org_member_invites.sql |
| 18 | Offline check-in — Dexie queue + sync on reconnect | src/lib/checkin/offline-db.ts, src/app/(dashboard)/events/[slug]/checkin/client.tsx |

### Build status
- Build validator: 12 PASS / 1 WARN (npm audit vulns, not our code) / 0 FAIL
- ESLint: clean
- TypeScript: clean

### Key decisions made in Sprint 3
- Member invite now uses `org_member_invites` table (migration 0004) — invites by email, no longer requires pre-existing Prezva account
- `acceptInvite(token)` now real: promotes to org_member, marks invite accepted, validates email match
- Offline DB (Dexie v4) — `prezva-checkin` IndexedDB, table `pending`, auto-syncs on `window:online`
- Announcement job sends to all confirmed registrations; `channel: 'push'` skips email (no push infra yet)
- Waitlist job: promotes top `waitlist_position` row, clears position, sends promotion email

---

## Resume Point — Next Session
**Next task: Apply migration 0004 to Supabase (staging then prod)**

```sql
-- Run in Supabase SQL editor (staging first, then prod):
-- supabase/migrations/0004_org_member_invites.sql
```

Then: Start next feature sprint (Task 50 — Attendee Web App per Master Build Plan, or whatever phase is next)

---

## Running Test Suites
```bash
npx vitest run                                           # unit tests
npx vitest run --config vitest.integration.config.ts    # integration (23)
bash ~/Prezva/scripts/validate/build.sh                 # full gate
```

---

## Infrastructure Notes
- Playwright MCP: `npx @playwright/mcp@latest --browser chrome --headless` — in ~/.claude.json
- Demo seed: civitas org / birmingham-sbw-2026 — DO NOT wipe
- `.env.test` needed for integration suite (gitignored, same creds as `.env.local`)

---

## Demo Seed Data (prezva.app)
- Owner: demo.owner@prezva-audit.test / AuditDemo2026!
- Org: civitas | Event: birmingham-sbw-2026

---

## Locked Decisions
- ALL code on lin ~/Prezva/dev/ — Mac is browser only (http://10.0.0.60:3100)
- Auth pages: useActionState (client components)
- redirect() uses plain strings — typedRoutes disabled
- Lint: eslint src/ --ext .ts,.tsx --max-warnings 0
- Write SQL/files via paramiko SFTP — never bash heredoc (PID contamination)
- DB push URL: postgresql://postgres:ERg%2A%3FZ6grtE5nH%24@db.jmhxyyrleipcorvkmxfk.supabase.co:5432/postgres
- After new pages: npm run build FIRST, then npm run type-check

---

## Completed Modules (cumulative)
- Schema + RLS (0001, 0002, 0003)
- CI/CD Gate (Task 21)
- Auth (Task 22) — 82/82 tests
- Orgs (Task 24) — createOrg, inviteMember, org switcher, settings
- Branding Sprint — Prezva tokens, sidebar, dashboard shells
- Events (Task 28) — full lifecycle, status badge, event card
- Trigger.dev v4 — registration confirmation + waitlist jobs
- Stripe Connect Express — direct charges, onboarding, webhook
- Landing page — prezva.app
- Registration + Tickets (Task 33) — Stripe Checkout, QR gen, confirmation email
- Attendees (Task 38) — list, search, CSV import/export, manual add
- Sprint 1 — 20 P0 schema/code fixes (commit 07ab7c7)
- Sprint 2 — 23 integration tests, real DB (commit 6ce61c5)
- Sprint 3 — 8 stub features made real (this session)

---

## Audit Gaps (still pending)
- Apply migration 0004 to Supabase staging + prod
- Seed script (Faker.js) — before testing at scale
- i18n foundation (next-intl) — Phase 1 Polish
- Push notification infra — announcements currently email-only
