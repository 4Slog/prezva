# Prezva Testing & Fix Checklist
**Last updated:** 2026-05-26  
**Approach:** Test → Log → Fix → Verify → Check off  
**Tools:** Claude Desktop (orchestration) · Claude Code (fixes) · Claude in Chrome (live testing)

---

## ✅ PHASE 0 — P0 Blockers — COMPLETE (May 25, 2026)

All 9 P0 blockers and 5 P1 items resolved before testing began.

| # | Blocker | Resolution | Commit |
|---|---|---|---|
| P0-1 | Resend domain unverified | 4 DNS records added to Namecheap, domain verified green | Manual DNS |
| P0-2 | Stripe Connect incomplete | charges_enabled + payouts_enabled confirmed, nothing due | Stripe dashboard |
| P0-3 | Zero Supabase storage buckets | 6 buckets confirmed live in production | Verified |
| P0-4 | Trigger.dev jobs not deployed | 11/11 jobs live, syncVercelEnvVars added to prevent drift | `c5b168e` |
| P0-5 | Wrong table in certificate query | eligibility.ts confirmed correct — check_ins with session_id IS NOT NULL | Verified |
| P0-6 | Session check-in unimplemented | checkInToSession action implemented in bundle14d | `6ea2f94` |
| P0-7 | Missing DB columns | stripe_session_id + press_token confirmed present | Verified |
| P0-8 | Missing INTEGRATION_ENCRYPTION_KEY | Present in .env.local and Vercel production | Verified |
| P0-9 | VAPID keys absent | All 3 VAPID vars present in both environments | Verified |
| P1-1 | SUPER_ADMIN_IDS missing | Added to Vercel production | Vercel |
| P1-2 | RESEND_FROM_EMAIL missing | Added to Vercel as noreply@prezva.app | Vercel |
| P1-3 | SUPABASE_DB_URL missing | Added to Vercel production | Vercel |
| P1-4 | Eventbrite var mismatch | Reconciled between .env.local and Vercel | Vercel |
| P1-5 | brand.ts teal wrong | Confirmed #2DD4BF in live codebase | Verified |

**Bonus bugs fixed during Phase 0:**
- `c5b168e` — @trigger.dev/cli was v3 package, moved to trigger.dev for v4
- `c5b168e` — validateEncryptionKey() crashing at module load time removed
- `c5b168e` — trigger.config.ts wrong project ref fixed
- `8569b0e` — getMyIssuedCertificates invalid Supabase subquery fixed
- `e98270f` — speaker/volunteer invite emails using wrong from address
- `bbefc1c` — storage-buckets.sql referencing 7 stale bucket names fixed

---

## ✅ PHASE 1 — Smoke Tests — COMPLETE (May 25, 2026)

All 5 smoke tests passed clean on prezva.app after Phase 0 deploy.

| Test | URL | Result |
|---|---|---|
| SMOKE-01 | prezva.app | ✅ PASS — hero loads, both CTAs present, no console errors |
| SMOKE-02 | prezva.app/api/health | ✅ PASS — {"ok":true,"timestamp":"..."} |
| SMOKE-03 | prezva.app/signup | ✅ PASS — all fields present and interactive |
| SMOKE-04 | prezva.app/login → /dashboard | ✅ PASS — Google OAuth redirect works, lands on dashboard |
| SMOKE-05 | prezva.app/discover | ✅ PASS — search bar + all filters render, no errors |

---

## 🔄 PHASE 2A — Persona Clickthroughs — IN PROGRESS

**Test data seeded:** GAPP Annual Summit 2026 (gapp-annual-summit-2026)
- 1 org, 1 event, 4 ticket types, 4 sessions, 3 speakers, 2 volunteers, 2 sponsors, 12 registrations
- Seed manifest: `/home/paul/Prezva/dev/test-data/seed-manifest.json` (on casa)

**Phase 2A first run: 43/57 passed**  
**Phase 2A retest (after fixes): 48/57 passed**  
**Still failing: 9 items**

| Persona | Steps | Pass | Fail | Status |
|---|---|---|---|---|
| 1 — Public Visitor | 8 | 8 | 0 | ✅ COMPLETE |
| 2 — New Organizer | 4 | 2 | 2 | ❌ Onboarding RLS + email |
| 3 — Org Owner | 16 | 16 | 0 | ✅ COMPLETE |
| 4 — Org Admin invite | 2 | 2 | 0 | ✅ COMPLETE |
| 5 — Org Staff invite | 1 | 1 | 0 | ✅ COMPLETE |
| 6 — Attendee w/account | 3 | 3 | 0 | ✅ COMPLETE |
| 7 — Guest Attendee | 3 | 2 | 1 | ❌ Confirmation page crash |
| 8 — Speaker portal | 4 | 0 | 4 | ❌ All 404 |
| 9 — Volunteer portal | 4 | 4 | 0 | ✅ COMPLETE |
| 10 — Sponsor portal | 4 | 4 | 0 | ✅ COMPLETE |
| 11 — MC Hub | 3 | 3 | 0 | ✅ COMPLETE |
| 12 — Press portal | 3 | 3 | 0 | ✅ COMPLETE |
| Lobby display | 2 | 2 | 0 | ✅ COMPLETE |

---

## 🔴 P0 — Broke Since Phase 2A Testing

| # | Area | Bug | Status | Fixed In |
|---|---|---|---|---|
| P0-1 | Dev server | Route slug conflict — `[eventId]` vs `[id]` vs `[slug]` — server wouldn't start | ✅ FIXED | `6d5b50b` |
| P0-2 | Badges | Print/preview returns raw JSON error for ALL events including ones with 13 registrations | ⏸️ OPEN | — |

---

## 🟠 P1 — Blocking Phase 2A Completion

| # | Area | Bug | Status | Fixed In |
|---|---|---|---|---|
| P1-1 | Speaker portal | All speaker portal tokens return 404 — token lookup broken | ⏸️ OPEN | — |
| P1-2 | Registration | Confirmation page crashes after successful registration — client component throw | ⏸️ OPEN | — |
| P1-3 | Onboarding | RLS violation on org creation for new email/password accounts | ⏸️ OPEN | — |
| P1-4 | Icebreakers | Starter pack silently fails to persist — toast fires, navigate away = empty | ⏸️ OPEN | — |
| P1-5 | Icebreakers | `{event_title}` merge tag not resolved — shows literal placeholder | ⏸️ OPEN | — |
| P1-6 | Trivia | Button says "Load 10 questions" but loads all 55 — wrong label | ⏸️ OPEN | — |
| P1-7 | Trivia | Same silent persist failure as icebreakers | ⏸️ OPEN | — |
| P1-8 | Surveys | Preview link returns 404 — `prezva.app/survey/{id}` page missing | ⏸️ OPEN | — |
| P1-9 | Surveys | No way to view or edit survey questions after creation | ⏸️ OPEN | — |
| P1-10 | Public pages | Org public page `/o/{slug}` returns 404 — regression | ⏸️ OPEN | — |
| P1-11 | Security | RLS not verified on migrations 0063–0082 (~19 new tables) | ⏸️ OPEN | — |

---

## 🟡 P2 — Fix Before First Customer Demo

| # | Area | Bug | Status | Fixed In |
|---|---|---|---|---|
| P2-1 | Announcements | AI drafting shows "not configured" error | ⏸️ OPEN | — |
| P2-2 | Trivia | Saving question with 1 answer option silently fails — no validation error | ⏸️ OPEN | — |
| P2-3 | Events | New event defaults to Central timezone instead of Eastern for Atlanta | ⏸️ OPEN | — |
| P2-4 | Onboarding | Org slug strips hyphens on manual input | ⏸️ OPEN | — |
| P2-5 | Onboarding | Auto-generated org slug can exceed 40 char limit silently | ⏸️ OPEN | — |
| P2-6 | Email | Confirmation email lands in spam — SPF/DKIM deliverability | ⏸️ OPEN | — |
| P2-7 | Stripe | Connect flow opens in same tab — user loses dashboard position | ⏸️ OPEN | — |
| P2-8 | Git | Commits show `wu@Pauls-MacBook-Pro.local` instead of real identity | ⏸️ OPEN | — |

---

## ⏸️ PHASE 2B — Payment Flows — NOT STARTED
Blocked until confirmation page crash (P1-2) is fixed.

## ⏸️ PHASE 2C — Email Delivery — NOT STARTED
## ⏸️ PHASE 2D — Offline Check-in Sync — NOT STARTED
## ⏸️ PHASE 2E — Data Integrity — NOT STARTED
## ⏸️ PHASE 3 — Security Hardening — NOT STARTED
## ⏸️ PHASE 4 — Performance — NOT STARTED
## ⏸️ PHASE 5 — Accessibility — NOT STARTED
## ⏸️ PHASE 6 — Reliability & Monitoring — NOT STARTED
## ⏸️ PHASE 7 — Human UAT — NOT STARTED

---

## 📋 Test Infrastructure — Must Build Before Full Automation

| # | Harness | Status |
|---|---|---|
| TI-1 | Persona Session Factory (`e2e/fixtures/personas.ts`) | ⏸️ NOT BUILT |
| TI-2 | Stripe test mode flow wrapper | ⏸️ NOT BUILT |
| TI-3 | RLS exhaustive auditor (`rls-complete.test.ts`) | ⏸️ NOT BUILT |
| TI-4 | Offline SW interceptor | ⏸️ NOT BUILT |
| TI-5 | Trigger.dev job assertion helper | ⏸️ NOT BUILT |
| TI-6 | Mailhog email client | ⏸️ NOT BUILT |
| TI-7 | k6 load test suite | ⏸️ NOT BUILT |
| TI-8 | Lighthouse CI / a11y pipeline | ⏸️ NOT BUILT |

---

## 📈 Progress Summary

| Phase | Status | Score |
|---|---|---|
| Phase 0 — P0 Blockers | ✅ COMPLETE | 14/14 |
| Phase 1 — Smoke Tests | ✅ COMPLETE | 5/5 |
| Phase 2A — Persona Clickthroughs | 🔄 IN PROGRESS | 48/57 (84%) |
| Phase 2B–E — Critical Path | ⏸️ NOT STARTED | 0/~80 |
| Phase 3 — Security | ⏸️ NOT STARTED | 0/~40 |
| Phase 4 — Performance | ⏸️ NOT STARTED | 0/20 |
| Phase 5 — Accessibility | ⏸️ NOT STARTED | 0/10 |
| Phase 6 — Reliability | ⏸️ NOT STARTED | 0/~15 |
| Phase 7 — Human UAT | ⏸️ NOT STARTED | 0/41 |
| **Total** | | **67/287+ (~23%)** |

---

## 🎯 Next Actions (in order)

1. Fix P0-2 badge print + P1-1 speaker portal + P1-2 confirmation crash + P1-3 onboarding RLS → Claude Code batch
2. Re-run Phase 2A retest → should hit 57/57
3. Fix P1-4 through P1-10 (icebreakers/trivia/surveys/org page) → Claude Code batch
4. Phase 2B payment flows (requires Stripe test account setup)
5. Phase 2C email delivery tests
6. Continue through all remaining phases

