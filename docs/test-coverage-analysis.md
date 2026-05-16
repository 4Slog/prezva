# Test Coverage Analysis

Repository: `4Slog/prezva` · Branch: `claude/analyze-test-coverage-r0wj3`
Scope: everything under `src/`, `e2e/`, and `supabase/migrations/`.

---

## 1. What's in the codebase today

| Layer | Count | Notes |
|---|---|---|
| Source files (`src/**/*.{ts,tsx}`, excluding tests) | 322 | |
| API route handlers (`src/app/api/**/route.ts`) | 66 | |
| Server-action / lib modules (`src/lib/**/*.ts`) | 79 | |
| React components (`src/components/**/*.tsx`) | 33 | |
| Supabase migrations | 36 | |
| Unit/structural tests (`src/__tests__/*.test.ts`) | 22 files / ~3 100 LOC | |
| Integration tests (`src/__tests__/integration/*.test.ts`) | 6 files / 380 LOC | |
| E2E tests (`e2e/*.spec.ts`) | 7 files / 768 LOC | |
| Component tests (`*.test.tsx` or `@testing-library/react` imports) | **0** | |

### Test infrastructure

- `vitest.config.ts` — jsdom, globals on, setup file is a one-liner that imports `@testing-library/jest-dom`.
- `vitest.integration.config.ts` — node env, only runs `src/__tests__/integration/**`, requires Supabase service-role creds; no transaction rollback, just a manual `cleanupIntTestData()` helper that targets rows by string suffix.
- `playwright.config.ts` — single chromium project, no auth fixture, no storage state, no parallelism (`fullyParallel: false`).
- `package.json` scripts: `test`, `test:watch`, `test:e2e`, `test:all`. **No `test:coverage`** target and no coverage threshold configured.
- `package.json:16` — `"validate": "bash ~/Xekin/scripts/validate/build.sh all"` points outside the repo to a Xekin script. Broken in CI and in this container.

---

## 2. The big structural problem: most "tests" are file-existence greps

Counting `existsSync` / `readFileSync` / `toContain` assertions per test file:

| File | `it()` blocks | structural asserts | Real behavior tests? |
|---|---:|---:|---|
| `auth.test.ts` | 21 | **40** | No — entirely file-existence + source-string greps |
| `rls.test.ts` | 10 | **13** | No — greps `0002_rls.sql` for substrings |
| `templates.test.ts` | 22 | **73** | No |
| `sprint21.test.ts` | 15 | **87** | No |
| `sprint22.test.ts` | 16 | **90** | No |
| `sprint23.test.ts` | 17 | **42** | No |
| `sprint24.test.ts` | 12 | **51** | No |
| `sprint25.test.ts` | 13 | **59** | No |
| `sprint27.test.ts` | 25 | **65** | No |
| `usermenu.test.ts` | 9 | **18** | No |
| `schema.test.ts` | 5 | 7 | No |
| `attendees.test.ts` | 13 | 3 | Mostly yes |
| `events.test.ts` | 12 | 9 | Mixed |
| `registration.test.ts` | 13 | 1 | Yes (mocked) |
| `agenda/analytics/announcements/checkin/messaging/orgs/public/surveys` | 5–13 each | 0–2 | Yes (mocked) |

Roughly **half of the unit-test suite never invokes a function under test.** Example from `auth.test.ts:65`:

```ts
it('actions.ts exports all required functions', () => {
  const content = readFileSync(join(SRC, 'lib/auth/actions.ts'), 'utf-8')
  expect(content).toContain('export async function signIn')
})
```

That assertion passes if `// export async function signIn` appears as a comment. It does not test sign-in. Every sprint file follows this pattern. These tests are giving false confidence and burning CI time.

**Recommendation:** treat the sprint*.test.ts files as deletable scaffolding. Replace each with a real behavior test for the specific feature that sprint shipped. Keep the structural ones only where they assert non-code invariants (e.g. migration file is non-empty before running it).

---

## 3. RLS is not actually tested

`src/__tests__/rls.test.ts` reads `supabase/migrations/0002_rls.sql` and asserts the SQL text contains "`enable row level security`" and `create policy` strings. It never executes a query as user A and tries to read user B's row. For a multi-tenant SaaS this is the single most dangerous gap.

The integration suite (`src/__tests__/integration/*.integration.test.ts`) uses **only the service-role key** (`setup.ts:8`), which bypasses RLS by design. So there's no test in the codebase, at any layer, that proves cross-tenant isolation actually holds.

**Recommendation (high priority):**

1. Add a `vitest.rls.config.ts` that uses two anon-key clients seeded for two different orgs.
2. For every table with RLS (23 tables enumerated in `rls.test.ts:7`), write a pair:
   - "user in org A can read own row"
   - "user in org A cannot read org B's row"
3. Same pattern for INSERT/UPDATE/DELETE on `registrations`, `check_ins`, `messages`, `org_members`, `audit_logs`.
4. Add a regression test for `0019_sprint19_anon_registration_rls.sql` — anon should be able to insert a registration but not read others.

---

## 4. API route coverage map

66 routes exist. Grepping every test file for the route path:

- **3** routes are even mentioned in a test (`/api/events`, `/api/orgs`, `/api/webhooks/stripe`).
- **63** routes — including every admin, MFA, GDPR, certificate, agenda, attendee, volunteer, integration, push, calendar, photo-upload, and Wallet-pass endpoint — have zero test references.

The "tested" three:

| Route | Coverage |
|---|---|
| `POST /api/events` | name validation only |
| `POST /api/orgs` | input validation + happy path (mocked) |
| `POST /api/webhooks/stripe` | one test: returns 400 with no signature |

The Stripe webhook is the most dangerous of these. The handler processes `checkout.session.completed`, `checkout.session.expired`, and `payment_intent.payment_failed` (`route.ts:24,75,87`). None of the three event types' happy or sad paths are tested. The duplicate-delivery idempotency guard at `route.ts:44` (`.eq('status', 'pending')`) is also untested.

---

## 5. Service-role / admin-bypass endpoints

21 routes call `createAdminClient` and therefore bypass RLS:

```
admin/orgs/[id]/{offboard,suspend,unsuspend}
admin/users/onboard
certificates/[regId]
dead-letter
events/[slug]/calendar.ics
events/[slug]/dead-letters/[id]/{replay,resolve}
events/[slug]/volunteers (+ [id]/{checkin,remove,resend})
gdpr/{delete,export}
integrations/[provider]/callback
orgs/{,[id]/invites/[inviteId]}
passes/apple/[registrationId], passes/google/[registrationId]
registrations/[id]/calendar.ics
volunteer/[token]/{clock-in,clock-out}
webhooks/stripe
```

Every one of these must enforce its own authorization (it can't rely on Postgres for the cross-check). None of them have authorization tests. This is the second highest risk area after RLS — a single missing `requireUser()` or role check here exposes the whole tenant.

**Recommendation:** for each of the 21 routes, add at minimum:
- Unauthenticated request → 401.
- Authenticated as wrong-org member → 403.
- Authenticated as correct role → 200 and writes the expected row.

---

## 6. Specific high-risk gaps, ranked

### Critical (do these first)

1. **Real RLS enforcement tests.** See §3.
2. **Stripe webhook event handling.** Mock Stripe events for `checkout.session.completed` (confirms registration, increments discount uses, enqueues email), `checkout.session.expired` (reverts to expired), `payment_intent.payment_failed` (marks failed). Add a "second delivery of same event_id is a no-op" test for the idempotency guard.
3. **Authorization on the 21 service-role routes.** See §5.
4. **MFA endpoints** (`/api/auth/mfa/{enroll,verify,unenroll}`). Currently zero tests. Critical security primitive.
5. **GDPR export and delete.** Legally required. Zero tests. At minimum: export returns only the requesting user's data; delete cascades correctly and is reversible-within-window per policy.

### High

6. **Volunteer token endpoints** (`/api/volunteer/[token]/clock-{in,out}`). Public, token-authed. No test for expired tokens, replay, or scope (token from event A used on event B).
7. **Anon registration RLS** (migration 0019). The whole "guests can register without an account" flow is one of the most-trafficked paths and has no tests beyond the migration grep.
8. **Stripe Connect callback / status / onboarding** (`/api/connect/*`). Couples our charge flow to per-org Stripe accounts. Untested.
9. **Apple Wallet / Google Wallet pass generation** (`/api/passes/apple/[registrationId]`, `/api/passes/google/[registrationId]`, helpers in `src/lib/passes/{apple-pass,google-wallet}.ts`). Uses signing keys; output must be cryptographically valid. Untested.
10. **Offline check-in queue.** `src/lib/checkin/offline-db.ts` (Dexie) and `/api/events/[id]/checkin/sync`. No tests for queue ordering, dedup on retry, or conflict resolution when the same attendee is scanned offline twice.
11. **Trigger.dev background jobs.** `src/trigger/jobs/{certificate-email,registration,announcement,speaker-invite,volunteer-invite}.ts` — five jobs, zero tests. They are always mocked in route tests, so the job code itself (payload shape, retries, idempotency) has no coverage.

### Medium

11. **Zod schemas.** 12 files in `src/lib/**` use zod for input validation; **zero** test files import zod. Add unit tests for each schema's rejection cases.
12. **Webhook signature verification helpers.** `src/lib/integrations/_shared/webhook-verify.ts` and `_shared/encryption.ts` (token-at-rest encryption) are security primitives with no direct tests.
13. **Third-party integration adapters** (15 adapters in `src/lib/integrations/`). Mailchimp, Eventbrite, Zoom webhook, Google Forms, Constant Contact, etc. Each has an OAuth flow, sync logic, and (for Zoom) a webhook handler. Mock the upstream and test happy + error paths.
14. **Email content.** `src/lib/trigger.ts` enqueues Resend emails; the templates themselves aren't snapshotted. A typo in the confirmation email is invisible until production.
15. **Timezone correctness.** `sprint24.test.ts:46` only checks that the string `timeZone: timezone` appears in source. No test exercises an event in `America/Los_Angeles` with an attendee viewing from `Asia/Tokyo`.
16. **Discount math.** `registration.test.ts:247-267` tests `Math.min`/`Math.round` directly, not the discount-application code. The actual function in `lib/registration/actions.ts` is untested for stacking, percent-of-cap, and "discount cannot exceed price".
17. **Certificate eligibility.** `src/lib/certificates/eligibility.ts` has business rules with no test file.
18. **Audit log writes.** `src/lib/audit/log.ts` — does every privileged action actually write an entry? No tests.
19. **PDF generation.** `src/lib/pdf/` (certificate rendering via `@react-pdf/renderer`) has no test that renders a sample certificate and asserts page layout, attendee name placement, or that signing metadata is included.
20. **Push notifications.** `src/lib/push/send.ts` and `/api/push/{health,subscribe}` are untested. Web-push VAPID key handling is security-relevant.
21. **CSV import/export.** `src/lib/productivity/csv-utils.ts` plus `/api/events/[id]/attendees/{import,export}` — no tests for UTF-8 BOM, embedded commas, mismatched headers, large files, or duplicate-row handling.
22. **Discount `max_uses` enforcement.** The discount lookup exists, but no test exercises the path where a code has hit its cap and the next checkout must reject it. The `increment_discount_uses` RPC (migration 0030) likewise has no race-condition test.

### Lower / hygiene

19. **React component tests = 0.** Add at least one happy-path render test per interactive component, starting with `QRScanner`, `CheckInDashboard`, `TicketManager`, `TwoFactorSetup`, `PushSubscriber`, `OfflineIndicator`, `UserMenu`.
20. **E2E is mostly "page renders."** `e2e/critical-paths.spec.ts` has 9 tests; 8 of them only assert that a page loaded without 500. Add genuine end-to-end assertions: a paid registration grants entry on check-in day; an offline scan syncs and dedupes when reconnected; a survey response shows up in the analytics tile.
21. **Integration suite is single-tenant.** All 6 integration tests query against one hardcoded org (`DEMO.orgId` in `setup.ts:25`). Add a second tenant fixture so multi-tenant bugs aren't invisible.
22. **No coverage measurement.** Add `@vitest/coverage-v8` and a `npm run test:coverage` script with a threshold (start at lines ≥ 50% for `src/lib/**` and `src/app/api/**`, ratchet up).
23. **`npm run validate` is broken.** It shells out to `~/Xekin/scripts/validate/build.sh`, which doesn't exist in this repo. Either vendor the script under `scripts/validate/` or remove the npm alias.
24. **No HTTP-level mocking.** `vi.mock()` chains are hand-rolled per test (see the 50-line builder at the top of `registration.test.ts`). Adopting MSW for fetch-level mocking would shrink boilerplate and let webhook/integration tests exercise real `Request`/`Response` flow rather than mocked Supabase chains.

---

## 7. Recommended sequence

1. **Land an RLS test harness.** Two anon clients, two orgs, one shared utility module. Add the 23-table isolation matrix in one PR. Highest ROI.
2. **Stripe webhook + the 21 service-role routes.** One PR per logical group (admin, gdpr, volunteer, passes, connect). Each route gets unauth/wrong-role/correct-role at minimum.
3. **Delete or rewrite the sprint*.test.ts files.** They give false confidence. Replace with behavior tests for the same features.
4. **Add coverage measurement with a low floor.** Make it visible in PRs. Don't gate on it yet — first establish the baseline.
5. **Component tests + a meaningful E2E happy path.** Pay-and-check-in is the entire product; ship one Playwright test that does it for real (Stripe test card, QR scan, dashboard count goes up).
6. **Integration adapters and zod schemas.** Long tail; parallelizable.
