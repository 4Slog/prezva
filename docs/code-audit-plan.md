# Prezva Code Audit Plan

A runnable static-analysis checklist that Claude Code executes autonomously to find security holes, type holes, dead code, and ticking time bombs that browser-based testing can never see.

Pair this with `stress-test-plan.md` — run code audit first (catches problems before they reach a browser), then stress test (catches problems users see).

---

## How to run

In Claude Code on lin:
```
Read /home/paul/Prezva/dev/docs/code-audit-plan.md and execute every audit section sequentially. After each section produce a 1-2 line PASS/FAIL/CONCERN finding. After the final section produce a complete report with all findings, sorted by severity (critical → high → medium → low). Save the report to /home/paul/Prezva/dev/docs/audit-reports/YYYY-MM-DD-audit.md.
```

Each audit section below is self-contained — every command is runnable, every check has a clear pass/fail signal.

---

## Audit 1: RLS coverage — every table has appropriate policies

WHY: An unprotected table is a data leak. A table with only `service_role_all` is fine if it's only ever touched server-side, but if any client code reads it the data is exposed to anyone signed in.

COMMANDS:
```bash
# List all public tables
psql "$DATABASE_URL" -c "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;" || \
echo "Use Supabase MCP execute_sql instead"

# Tables without RLS enabled at all (critical)
SELECT c.relname AS table_name
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;

# Tables with only service_role policies (must verify no client reads them)
SELECT tablename, COUNT(*) as policy_count,
  bool_or(roles::text LIKE '%service_role%') as has_service_role,
  bool_or(roles::text LIKE '%authenticated%') as has_authenticated,
  bool_or(roles::text LIKE '%anon%') as has_anon
FROM pg_policies WHERE schemaname='public' GROUP BY tablename ORDER BY tablename;
```

THEN for each table flagged with only service_role:
```bash
TABLE=<flagged_table>
grep -rn "from('$TABLE')\\|.from(\"$TABLE\")" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v "createAdminClient\|admin\\.from"
```
If this returns ANY lines, those are user-scoped reads of a table that only allows service_role — they will silently return empty arrays.

PASS: No tables without RLS. Every service_role-only table is only read via `createAdminClient`.
FAIL: Note table name + which file reads it without admin client.

---

## Audit 2: Server action auth — every mutation checks user + org

WHY: A server action without `requireUser()` allows anonymous mutations. One without org membership check allows cross-tenant data theft.

COMMANDS:
```bash
# Find all 'use server' files
find src/lib -name "*.ts" -exec grep -l "'use server'" {} \;

# For each, find every exported async function and check it calls requireUser
for f in $(find src/lib -name "*.ts" -exec grep -l "'use server'" {} \;); do
  echo "=== $f ==="
  awk '/^export async function/ { fn=$0; getline; while ($0 !~ /^export|^}/ && NR<NR+100) { body = body "\n" $0; getline } if (body !~ /requireUser|auth\.getUser/) print fn; body="" }' "$f"
done
```

Also check that org-scoped actions verify membership:
```bash
# Functions that mutate org-scoped tables (sessions, tickets, etc) MUST call assertOrgMember or equivalent
grep -rn "assertOrgMember\|assertEventAccess\|isOrgMember" src/lib/ --include="*.ts" | wc -l

# Compare to mutation count
grep -rn "\.from\(.*\)\\.insert\|\.from\(.*\)\\.update\|\.from\(.*\)\\.delete" src/lib/ --include="*.ts" | grep -v node_modules | wc -l
```
The first should be at least 50% of the second.

PASS: Every exported `'use server'` async function calls `requireUser()`. Org-scoped mutations call `assertOrgMember()` or `assertEventAccess()`.
FAIL: List each function missing the check.

---

## Audit 3: API route auth — every route validates method + auth

WHY: A POST endpoint with no method check accepts GETs. A route with no auth lets anyone hit it.

COMMANDS:
```bash
# Find all API routes
find src/app/api -name "route.ts"

# For each route, check it has method exports (GET/POST/etc) and auth
for f in $(find src/app/api -name "route.ts"); do
  has_auth=$(grep -E "requireUser|auth\.getUser|CRON_SECRET|ADMIN_SECRET|webhook.*verify|validateSpeakerToken" "$f" | head -1)
  has_method=$(grep -E "^export async function (GET|POST|PUT|DELETE|PATCH)" "$f" | head -1)
  if [ -z "$has_auth" ]; then echo "NO_AUTH: $f"; fi
  if [ -z "$has_method" ]; then echo "NO_METHOD: $f"; fi
done
```

Exempt routes (public by design):
- `/api/webhooks/stripe/route.ts` — auth via Stripe signature
- `/api/connect/callback/route.ts` — auth via state token
- Public registration endpoint

PASS: All routes have explicit method exports + some form of auth, OR are in the public-by-design list.
FAIL: List each route + what's missing.

---

## Audit 4: Type safety — `as any` and `@ts-ignore` counts

WHY: Each `as any` cast is a place where type errors are hidden. Each `@ts-ignore` is a known type bug. Growing counts mean type safety is decaying.

COMMANDS:
```bash
# Count and locate
echo "as any casts: $(grep -rn 'as any' src/ | grep -v node_modules | grep -v test | wc -l)"
echo "@ts-ignore: $(grep -rn '@ts-ignore' src/ | grep -v node_modules | wc -l)"
echo "@ts-nocheck: $(grep -rn '@ts-nocheck' src/ | grep -v node_modules | wc -l)"

# Top 10 files with most as any
grep -rn 'as any' src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | cut -d: -f1 | sort | uniq -c | sort -rn | head -10
```

THRESHOLDS:
- `as any` count: should be under 100 after Bundle 8 type regen
- `@ts-ignore` count: should be 0
- `@ts-nocheck` count: should be 0

PASS: All within threshold.
CONCERN: Any growth from prior audit.

---

## Audit 5: Webhook idempotency — Stripe webhook + Trigger.dev tasks

WHY: Webhooks can fire twice. If processing isn't idempotent you'll double-charge, double-send, or corrupt state.

COMMANDS:
```bash
# Read stripe webhook
cat src/app/api/webhooks/stripe/route.ts
```

CHECKS per event handler:
- Does it check for duplicate processing? (e.g. `stripe_event_id` UNIQUE on the table, or check before insert)
- Does it use UPSERT instead of INSERT?
- Does it have try/catch with proper error logging?

```bash
# Check stripe_events table exists for dedup
grep -rn "stripe_events\|stripe_event_id" supabase/migrations/*.sql | head -5
```

Trigger.dev tasks:
```bash
for f in src/trigger/jobs/*.ts; do
  echo "=== $f ==="
  grep -E "INSERT|UPDATE|upsert|onConflict" "$f" | head -5
done
```

PASS: Stripe webhook handlers all check for duplicate event IDs. Trigger.dev tasks use upserts or pre-flight existence checks.
FAIL: Note each handler that does a naive insert.

---

## Audit 6: Cron job hygiene — auth, optimistic locks, error states

WHY: A cron with no auth can be hit by anyone. A cron without locking will double-process concurrent runs.

COMMANDS:
```bash
# Vercel cron routes
find src/app/api/cron -name "route.ts"
cat src/app/api/cron/scheduled-announcements/route.ts

# Trigger.dev scheduled tasks
grep -rn "schedules\.task\|cron:" src/trigger/ --include="*.ts"
```

CHECKS per cron:
- Auth: checks `CRON_SECRET` header or uses Trigger.dev secret
- Optimistic locking: updates with `.eq('status', expected_value)` to prevent double-pickup
- Error handling: catches errors and marks failed status, doesn't crash silently
- Limits: `.limit(N)` prevents runaway processing

PASS: All crons authed + locked + bounded.
FAIL: Note each cron + missing safeguard.

---

## Audit 7: Email templates — no `{first_name}` unfilled, no "undefined"

WHY: Customer-facing emails with `Hi {first_name}` or `Hi undefined` are demo-killers.

COMMANDS:
```bash
# Find all email-generating code
grep -rn "Resend\|sendEmail\|resend.emails.send\|new Resend\|from.*noreply\|html.*From\|html.*Hi " src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v test

# Find templates with merge tags
grep -rn "{first_name}\|{full_name}\|{attendee_name}\|{event_title}\|{org_name}\|{undefined}" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules

# Find places where merge tags are replaced
grep -rn "\.replace.*{.*}\|template.*replace\|interpolate" src/lib/templates/ src/trigger/ --include="*.ts" | head -20
```

CHECKS:
- For each template literal email body, are all `{tag}` placeholders replaced before sending?
- Are first names extracted via `attendee_name.split(' ')[0]` somewhere?
- Are any emails sent with raw `attendee_name` (might be full name) where first name is expected?

PASS: All merge tags are replaced before send. First names extracted properly.
FAIL: List each unsafe template.

---

## Audit 8: Schema sync — does database.ts match actual DB?

WHY: Stale generated types let bugs through TypeScript compilation. Code thinks a column exists when it doesn't, or vice versa.

COMMANDS:
```bash
# Regenerate types into a temp file and diff
npx supabase gen types typescript --project-id jmhxyyrleipcorvkmxfk > /tmp/database-fresh.ts 2>/dev/null
diff src/types/database.ts /tmp/database-fresh.ts | head -50

# Word counts as a quick signal
echo "Current: $(wc -l src/types/database.ts)"
echo "Fresh:   $(wc -l /tmp/database-fresh.ts)"
```

Also check for runtime schema mismatches (columns code uses that don't exist):
```bash
# Read recent error logs if available
grep -rn "Could not find the.*column.*schema cache\|column .* does not exist" docs/audit-reports/ 2>/dev/null | head -10
```

PASS: Diff is empty or trivial. No "column does not exist" errors in recent logs.
FAIL: Run `npx supabase gen types typescript --project-id jmhxyyrleipcorvkmxfk > src/types/database.ts` and re-run type-check.

---

## Audit 9: Migration ordering — no gaps, no duplicates, all applied

WHY: Migration gaps mean someone's local DB will be out of sync. Duplicates mean a developer renamed a file mid-flight.

COMMANDS:
```bash
ls supabase/migrations/ | grep -E "^[0-9]+_" | sort

# Check sequential numbering (find gaps)
ls supabase/migrations/ | grep -oE "^[0-9]+" | sort -n | awk '
  BEGIN { prev = 0 }
  { if ($1 != prev + 1) print "GAP between " prev " and " $1; prev = $1 }
'

# Check duplicates
ls supabase/migrations/ | grep -oE "^[0-9]+" | sort | uniq -d
```

Then check what's been applied to production via Supabase MCP `list_migrations`. Compare to local files.

PASS: Sequential, no gaps, no duplicates, every local migration applied to production.
FAIL: List each gap or duplicate.

---

## Audit 10: Env var coverage — every `process.env.X` is documented + set

WHY: An undocumented env var is a tripwire. A new dev clones the repo, build silently uses `undefined`, things break in weird ways.

COMMANDS:
```bash
# All env vars referenced in code
grep -rohE "process\\.env\\.[A-Z_]+" src/ | sort -u

# Compare to .env.local
cat .env.local | grep -oE "^[A-Z_]+" | sort -u

# Compare to Vercel (requires API call) — just list code-side here
diff <(grep -rohE "process\\.env\\.[A-Z_]+" src/ | sed 's/process\.env\.//' | sort -u) \
     <(grep -oE "^[A-Z_]+" .env.local | sort -u)
```

Also check `docs/production-secrets.md` lists every required var.

PASS: Every `process.env.X` is in .env.local AND docs/production-secrets.md.
FAIL: List each missing var.

---

## Audit 11: Dead code — files imported nowhere, console.log, stale TODO

WHY: Dead code is a maintenance tax. console.log leaks info. Old TODOs are lies.

COMMANDS:
```bash
# Files never imported anywhere
for f in $(find src/lib src/components -name "*.ts" -o -name "*.tsx"); do
  base=$(basename "$f" .ts | sed 's/\.tsx$//')
  count=$(grep -rln "from.*'.*$base'\|from.*\"$base\"" src/ --include="*.ts" --include="*.tsx" | grep -v "$f" | wc -l)
  if [ "$count" = "0" ]; then echo "UNUSED: $f"; fi
done | head -20

# console.log in production code
grep -rn "console\\.log" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v test | wc -l

# Stale TODOs (just count, harder to date check)
grep -rn "TODO\|FIXME\|XXX\|HACK" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | wc -l
```

THRESHOLDS:
- UNUSED files: under 5 (some are legitimate entry points)
- console.log in production: under 10 (`console.error` is OK)
- TODOs: arbitrary; track delta from last audit

PASS: All within threshold.
CONCERN: Note significant growth.

---

## Audit 12: Security headers — middleware and Next.js config

WHY: Missing security headers = trivial XSS, clickjacking, MIME sniffing attacks.

COMMANDS:
```bash
cat next.config.ts | head -40
cat src/middleware.ts | head -40

# Headers that should be set
echo "Looking for security headers..."
grep -rn "Content-Security-Policy\|X-Frame-Options\|X-Content-Type-Options\|Strict-Transport-Security\|Referrer-Policy\|Permissions-Policy" src/ next.config.ts --include="*.ts" --include="*.tsx" | grep -v node_modules | head -10
```

REQUIRED HEADERS:
- `Strict-Transport-Security: max-age=63072000; includeSubDomains`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY` (or CSP frame-ancestors)
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Content-Security-Policy: default-src 'self'; ...` (this is harder, can be deferred)

PASS: All required headers present.
FAIL: List missing headers. Suggest middleware addition.

---

## Audit 13: N+1 queries and missing indexes

WHY: A loop with a query inside is fine for 10 rows, dies at 10,000.

COMMANDS:
```bash
# Look for awaits inside for loops
grep -rn "for.*of.*await\|forEach.*async\|map.*async" src/lib src/app --include="*.ts" --include="*.tsx" | grep -v node_modules | head -20

# Foreign keys without indexes
echo "Run via Supabase MCP:"
echo "SELECT
  c.conrelid::regclass AS table,
  string_agg(a.attname, ', ') AS missing_index_on
FROM pg_constraint c
JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
LEFT JOIN pg_index i ON i.indrelid = c.conrelid AND a.attnum = ANY(i.indkey)
WHERE c.contype = 'f' AND i.indrelid IS NULL
GROUP BY c.conrelid, c.conname;"
```

PASS: No await-in-loop patterns. All foreign keys have indexes.
CONCERN: List each.

---

## Audit 14: Build size — no oversized bundles

WHY: A 5MB JS bundle is a bad user experience. Check that nothing accidentally got bundled.

COMMANDS:
```bash
# Build production bundle
npm run build 2>&1 | tail -40 | grep -E "Route|First Load JS|chunks|Size"

# Largest files in .next
du -sh .next/static/chunks/*.js 2>/dev/null | sort -rh | head -10
```

THRESHOLDS:
- Main bundle First Load JS: under 250KB
- Largest individual chunk: under 500KB

PASS: All within threshold.
CONCERN: Note bloated routes.

---

## Audit 15: Stripe handler completeness — every event type handled

WHY: An unhandled webhook event is a silent business failure (refund webhook drops on the floor, user keeps their tickets).

COMMANDS:
```bash
cat src/app/api/webhooks/stripe/route.ts | grep -E "case '|event\\.type ==" | head -30
```

Cross-check against the events configured in Stripe dashboard. Critical events that must be handled:
- `checkout.session.completed`
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `charge.refunded`
- `charge.dispute.created`
- `account.updated` (Connect)
- `invoice.payment_succeeded` (subscriptions, future)
- `customer.subscription.deleted` (subscriptions, future)

PASS: All critical events handled.
FAIL: List unhandled events configured in Stripe dashboard.

---

## Audit 16: Frontend a11y smoke check

WHY: Catches obvious accessibility regressions before deep WCAG testing.

COMMANDS:
```bash
# Buttons without text (just icons) — must have aria-label
grep -rn "<button" src/ --include="*.tsx" | grep -v "aria-label" | grep -v ">.*<" | head -10

# Inputs without labels
grep -rn "<input" src/ --include="*.tsx" | grep -v "aria-label\|<label" | head -10

# Images without alt
grep -rn "<img" src/ --include="*.tsx" | grep -v 'alt=' | head -10
```

PASS: All inputs have associated labels, buttons have text or aria-label, images have alt.
CONCERN: List each violation.

---

## Audit 17: Secrets exposed in client bundles

WHY: A leaked service role key in the client bundle is game over.

COMMANDS:
```bash
# Build and search the client bundle for secret patterns
npm run build 2>&1 > /dev/null

# Search for what should never be in the client
for secret in SUPABASE_SERVICE_ROLE_KEY STRIPE_SECRET_KEY TRIGGER_SECRET_KEY RESEND_API_KEY CRON_SECRET INTEGRATION_ENCRYPTION_KEY VAPID_PRIVATE_KEY; do
  count=$(grep -rln "$secret" .next/static/ 2>/dev/null | wc -l)
  if [ "$count" -gt 0 ]; then echo "LEAK: $secret found in $count client files"; fi
done

# Also check for raw key values (replace these examples with your actual prefixes)
grep -rn "sk_live_\|sk_test_\|tr_prod_\|tr_live_\|whsec_\|service_role.*eyJ" .next/static/ 2>/dev/null | head -5
```

PASS: No server-side secrets in client bundles.
FAIL: This is a P0. Stop everything, rotate keys.

---

## Audit 18: Concurrency hazards — race conditions and double-clicks

WHY: A "Pay" button clicked twice creates two charges. A "Submit" pressed twice creates duplicate registrations.

COMMANDS:
```bash
# Find buttons that submit important actions — check for disabled state during pending
grep -rn "onClick.*async\|onSubmit.*async" src/app src/components --include="*.tsx" | head -20

# Look for setSaving/setPending/setLoading patterns
grep -rn "setSaving\|setLoading\|setPending\|setSubmitting" src/app src/components --include="*.tsx" | wc -l
```

Critical paths to verify:
- Registration submit
- Payment button
- Refund button
- Bulk certificate issue button
- Send announcement button
- Speaker invite button

Each must:
- Disable while pending
- Show "Saving..." or spinner
- Not allow double-submit

PASS: All critical paths have pending-state guards.
FAIL: List each unguarded button.

---

## Audit 19: GDPR data handling — export and delete fully wired

WHY: Legal requirement. A broken GDPR delete is a fine waiting to happen.

COMMANDS:
```bash
cat src/app/api/gdpr/export/route.ts | head -50
cat src/app/api/gdpr/delete/route.ts | head -50

# All tables that contain user data
grep -rn "user_id\|profile_id\|attendee_email\|email text" supabase/migrations/*.sql | head -20
```

CHECKS:
- GDPR export includes data from: profiles, registrations, attendee_profiles, community_posts, community_replies, leaderboard_points, photo_contest_entries, survey_responses, messages, conversations, audit_logs (user actions)
- GDPR delete cascades to all the same tables
- Audit log records the deletion request

PASS: Both endpoints cover all user-data tables.
FAIL: List missing tables.

---

## Audit 20: Critical UX bugs from recent stress tests

WHY: Re-verify the things we already fixed haven't regressed.

COMMANDS:
```bash
# Schema bugs from Bundle 9 audit
grep -rn "ALTER TABLE.*ADD COLUMN.*event_id" supabase/migrations/ | head -5
grep -rn "ALTER TABLE.*ADD COLUMN.*category" supabase/migrations/ | head -5
grep -rn "ALTER TABLE.*ADD COLUMN.*segment" supabase/migrations/ | head -5

# Bucket creation script
ls scripts/create-storage-buckets.ts

# Wallet button guards
grep -n "showAppleWallet\|showGoogleWallet" src/app/e/\[slug\]/confirmation/page.tsx

# Volunteer timezone fix
grep -n "timezone\|timeZone" src/app/\(dashboard\)/events/\[slug\]/volunteers/volunteers-client.tsx

# Audit log count
echo "logAudit() call sites: $(grep -rn 'logAudit' src/lib/ --include='*.ts' | grep -v 'audit/log' | wc -l)"
```

PASS: All regression checks present.
FAIL: A previously-fixed bug has been reintroduced.

---

## Final report format

After running all audits, save the report to `docs/audit-reports/YYYY-MM-DD-audit.md` in this format:

```markdown
# Prezva Code Audit Report — YYYY-MM-DD

## Summary
- Audits run: 20
- Critical findings: N
- High findings: N
- Medium findings: N
- Low findings: N

## Critical findings (P0 — fix immediately)
| Audit | Finding | File |
|---|---|---|
| 17. Secrets exposed | service role key in client bundle | .next/static/chunks/main-xxx.js |

## High findings (P1 — fix before next release)
...

## Medium findings (P2 — fix in next bundle)
...

## Low findings (P3 — track for future)
...

## Trend (vs previous audit)
- `as any` count: 152 (+12 from last audit) ← REGRESSION
- console.log count: 8 (-2)
- TODO count: 47 (+5)
- Migration count: 46 (+4 since last audit)

## Recommendations
1. ...
2. ...
```

---

## When to run

- **After every bundle merge:** sections 1-10 (quick, ~10 minutes)
- **Monthly:** full audit (sections 1-20, ~45 minutes)
- **Before any public release:** full audit + stress test
- **After any security incident:** full audit immediately
