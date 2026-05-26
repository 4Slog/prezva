# Prezva Testing & Fix Checklist
**Last updated:** 2026-05-26  
**Approach:** Test → Log → Fix → Verify → Check off  
**Tools:** Claude Desktop (orchestration) · Claude Code (fixes) · Claude in Chrome (live testing)

---

## How We Work
1. Test a feature live via Claude in Chrome — exactly as a real user
2. Log every bug found here with severity and status
3. Claude Code fixes in batches grouped by area
4. Re-test after fix to verify
5. Check it off only when verified working on production

---

## 🔴 P0 — Fix Before Any Customer Sees This

| # | Area | Bug | Status | Fixed In |
|---|---|---|---|---|
| P0-1 | Email | Resend domain DNS unverified — 100% email delivery failure | ⏸️ OPEN | — |
| P0-2 | Payments | Stripe Connect platform profile incomplete — blocks all paid ticket flows | ⏸️ OPEN | — |
| P0-3 | Storage | Zero Supabase storage buckets — silent upload failures | ⏸️ OPEN | — |
| P0-4 | Badges | Print/preview returns raw JSON error for ALL events including ones with registrations | ⏸️ OPEN | — |
| P0-5 | Certificates | Wrong table name in certificate eligibility query — crashes | ⏸️ OPEN | — |
| P0-6 | Certificates | Session-level check-in unimplemented — CE credits impossible | ⏸️ OPEN | — |
| P0-7 | Payments | Two missing DB columns breaking Stripe webhook sync | ⏸️ OPEN | — |
| P0-8 | Integrations | Missing INTEGRATION_ENCRYPTION_KEY crashes all integrations | ⏸️ OPEN | — |
| P0-9 | Push | VAPID keys absent — push notifications disabled | ⏸️ OPEN | — |
| P0-10 | Dev server | Route slug conflict — server wouldn't start | ✅ FIXED | `6d5b50b` |
| P0-11 | CI | Trigger.dev jobs not deploying to production | ✅ FIXED | `99e17ae` |

---

## 🟠 P1 — Fix Before Launch

| # | Area | Bug | Status | Fixed In |
|---|---|---|---|---|
| P1-1 | Icebreakers | Starter pack silently fails to persist — toast fires, navigate away = empty | ⏸️ OPEN | — |
| P1-2 | Icebreakers | `{event_title}` merge tag not resolved — shows literal placeholder | ⏸️ OPEN | — |
| P1-3 | Trivia | Button says "Load 10 questions" but loads all 55 — wrong label | ⏸️ OPEN | — |
| P1-4 | Trivia | Same silent persist failure as icebreakers | ⏸️ OPEN | — |
| P1-5 | Surveys | Preview link returns 404 — `prezva.app/survey/{id}` page missing | ⏸️ OPEN | — |
| P1-6 | Surveys | No way to view or edit survey questions after creation | ⏸️ OPEN | — |
| P1-7 | Public pages | Org public page `/o/{slug}` returns 404 — regression | ⏸️ OPEN | — |
| P1-8 | Portals | Speaker portal returns 404 on all tokens | ⏸️ OPEN | — |
| P1-9 | Registration | Confirmation page crashes after successful registration | ⏸️ OPEN | — |
| P1-10 | Onboarding | RLS violation on org creation for new email/password accounts | ⏸️ OPEN | — |
| P1-11 | Security | RLS not verified on migrations 0063–0082 (~19 new tables) | ⏸️ OPEN | — |

---

## 🟡 P2 — Fix Before First Demo

| # | Area | Bug | Status | Fixed In |
|---|---|---|---|---|
| P2-1 | Announcements | AI drafting shows "not configured" error | ⏸️ OPEN | — |
| P2-2 | Trivia | Saving question with 1 answer option silently fails — no validation error | ⏸️ OPEN | — |
| P2-3 | Events | New event defaults to Central timezone instead of Eastern for Atlanta org | ⏸️ OPEN | — |
| P2-4 | Onboarding | Org slug strips hyphens on manual input | ⏸️ OPEN | — |
| P2-5 | Onboarding | Auto-generated org slug can exceed 40 char limit silently | ⏸️ OPEN | — |
| P2-6 | Email | Confirmation email lands in spam (SPF/DKIM deliverability) | ⏸️ OPEN | — |
| P2-7 | Stripe | Connect flow opens in same tab — user loses dashboard position | ⏸️ OPEN | — |
| P2-8 | Git | Commits show `wu@Pauls-MacBook-Pro.local` instead of real identity | ⏸️ OPEN | — |

---

## 📋 Test Infrastructure — Must Build Before Full Automation

| # | Harness | Why Needed | Status |
|---|---|---|---|
| TI-1 | Persona Session Factory (`e2e/fixtures/personas.ts`) | Blocks all 12 persona E2E tests | ⏸️ NOT BUILT |
| TI-2 | Stripe test mode flow wrapper (`e2e/helpers/stripe.ts`) | Blocks all payment flow tests | ⏸️ NOT BUILT |
| TI-3 | RLS exhaustive auditor (`rls-complete.test.ts`) | Active security gap in 19 new tables | ⏸️ NOT BUILT |
| TI-4 | Offline SW interceptor (`e2e/helpers/offline.ts`) | Offline check-in sync untested | ⏸️ NOT BUILT |
| TI-5 | Trigger.dev job assertion helper | Background job outcomes untested | ⏸️ NOT BUILT |
| TI-6 | Mailhog email client | Email delivery untested | ⏸️ NOT BUILT |
| TI-7 | k6 load test suite (`load-tests/`) | Performance untested | ⏸️ NOT BUILT |
| TI-8 | Lighthouse CI / a11y pipeline | Accessibility untested in CI | ⏸️ NOT BUILT |

---

## 📊 Live Test Coverage — Page by Page

| Area | Pages Tested | Result | Re-test Needed |
|---|---|---|---|
| Homepage | Full scroll, all CTAs | ✅ PASS | No |
| Discover / search | Filters, event card, navigation | ✅ PASS | No |
| Public event page — all 9 tabs | Home, Agenda, Speakers, Sponsors, Community, Trivia, Icebreakers, Passport, Leaderboard | ✅ PASS | No |
| Volunteer signup tab (public) | Public form render | ✅ PASS | No |
| Org public page `/o/{slug}` | Page render | ❌ FAIL | After P1-7 fix |
| Guest registration form | Form fill, submit | ⚠️ PARTIAL | After P1-9 fix |
| Attendee confirmation page | Page render | ❌ FAIL | After P1-9 fix |
| Login page | Form render | ✅ PASS | No |
| Signup + email confirmation | Account creation | ✅ PASS | Spam issue noted |
| Onboarding — new org creation | Full flow | ❌ FAIL | After P1-10 fix |
| Org settings | Profile, team invite, Stripe button | ✅ PASS | No |
| Event creation — hybrid | Full form, all fields | ✅ PASS | No |
| Tickets | Free/paid/virtual, discount codes, reg questions | ✅ PASS | No |
| Agenda | Sessions, rooms, CE credits, Live Polls, edit | ✅ PASS | No |
| Speakers | Add, invite, renew, arrived, messages | ✅ PASS | No |
| Check-in | QR, manual, name search, dashboard, kiosk | ✅ PASS | No |
| Volunteers | Add, shift/role, portal buttons | ✅ PASS | No |
| Badges | Template chooser, preview, print | ❌ FAIL | After P0-4 fix |
| Announcements | 9 templates, composer, Draft with AI | ⚠️ PARTIAL | After P2-1 fix |
| Surveys | Create, persist, preview, view questions | ⚠️ PARTIAL | After P1-5 & P1-6 fix |
| Networking | Directory, search, update profile | ✅ PASS | No |
| Photos | Page load, public gallery link | ✅ PASS | No |
| Leaderboard | Point config, save, view public | ✅ PASS | No |
| Icebreakers | Starter pack, custom add | ❌ FAIL | After P1-1 & P1-2 fix |
| Trivia | Starter pack, custom add | ❌ FAIL | After P1-3 & P1-4 fix |
| Passport | Add locations, scan codes | ✅ PASS | No |
| Volunteer portal (Alicia + Devon) | All 5 features | ✅ PASS | No |
| Sponsor portal (both sponsors) | All tabs | ✅ PASS | No |
| Press portal | All content | ✅ PASS | No |
| MC Hub | Run of show, speakers, Q&A | ✅ PASS | No |
| Lobby display | Full TV view | ✅ PASS | No |
| Invalid token safety | All 4 portal types | ✅ PASS | No |
| Speaker portal | Token access | ❌ FAIL | After P1-8 fix |
| Advanced tiles | Sponsors, Analytics, Audit Log, Failed Jobs | ✅ PASS | No |
| Integrations | Connection status | ⚠️ PARTIAL | After env vars set |
| Publish flow | Not yet tested | ⏸️ PENDING | — |
| Public event page post-publish | Not yet tested | ⏸️ PENDING | — |
| Attendee hub `/me` | Not yet tested | ⏸️ PENDING | — |
| Analytics deep-dive | Not yet tested | ⏸️ PENDING | — |
| Certificates flow | Not yet tested | ⏸️ PENDING | — |
| Run of show — organizer | Not yet tested | ⏸️ PENDING | — |
| Payment flow — Stripe test cards | Not yet tested | ⏸️ PENDING | Needs TI-2 first |
| Email delivery tests | Not yet tested | ⏸️ PENDING | Needs TI-6 first |
| Security tests (IDOR, XSS, etc.) | Not yet tested | ⏸️ PENDING | Needs TI-3 first |
| Performance / load tests | Not yet tested | ⏸️ PENDING | Needs TI-7 first |
| Accessibility audit | Not yet tested | ⏸️ PENDING | Needs TI-8 first |
| Offline check-in sync | Not yet tested | ⏸️ PENDING | Needs TI-4 first |
| Cross-browser (Safari, Firefox) | Not yet tested | ⏸️ PENDING | Needs Playwright config |

---

## 📈 Progress Summary

| Category | Total | Fixed/Pass | Open | Pending |
|---|---|---|---|---|
| P0 bugs | 11 | 2 | 9 | — |
| P1 bugs | 11 | 0 | 11 | — |
| P2 bugs | 8 | 0 | 8 | — |
| Test infrastructure | 8 | 0 | 8 | — |
| Pages tested | 45 | 27 pass | 6 fail / 4 partial | 8 pending |
| Master Plan test items | 287 | ~50 run | — | ~237 pending |

