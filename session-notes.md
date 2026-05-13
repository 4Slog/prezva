# Prezva Session Notes

## Last updated: 2026-05-13

## Status: Sprint 27 complete ✅ | Branch: feature/ghl-integration | Tag: sprint27-complete

322 unit tests passing. Gate: 12 PASS 0 FAIL 1 WARN. Commit: d804f55 (.gitignore fix: 0e8a8b8)

---

## What was just completed (Sprint 27 — Hardening + Bug Fixes + Volunteer Module)

### Migration 0028 (supabase/migrations/0028_sprint27_hardening.sql)
- `public.volunteers` table: portal_access_token, role enum, unique(event_id, email)
- `get_volunteer_by_token(p_token text)` — SECURITY DEFINER function for token-gated portal
- `registrations_no_duplicate_idx` — unique index guards double-registration
- `org_members_role_idx` — perf index on (org_id, user_id, role)
- `public.dead_letter_items` table with RLS

### Migration 0029 (GHL integration — also in this branch)

### Volunteer module
- Admin page: `/events/[slug]/volunteers` (table + invite form + filter tabs)
- Portal: `/volunteer/[token]` — no-auth, token-gated
- Clock-in/out: `/api/volunteer/[token]/clock-in|clock-out`
- Invite email: `src/trigger/jobs/volunteer-invite.ts` (Trigger.dev schemaTask)
- Admin tile registered, volunteer badge template in badges.ts (#dc2626)
- CheckInDashboard shows volunteerStatus panel

### Hardening
- Stripe checkout: `idempotencyKey: registrationId` prevents duplicate charges
- Registration actions: `charges_enabled + details_submitted` check before paid checkout
- Dead-letter admin page + API route (`/api/dead-letter`)

### Bug fixes
- B-01: AttendeeTable rows clickable (router.push to detail page)
- B-04: Certificates tile href → `/certificates` (was `/settings`)
- Attendee detail page: `starts_at` (was `start_time` → 500 error)
- Public sponsors page: created missing `/e/[slug]/sponsors/page.tsx`
- Sidebar: dynamic org slug injection via `usePathname()`
- Dashboard: real confirmed/checked-in stats
- Public checkin redirect: `/e/[slug]/checkin → /events/[slug]/checkin`

### DB operations (prod)
- Applied migration 0028 via psql
- Updated birmingham-sbw-2026 event timestamps (start: 2026-06-09, end: 2026-06-11)
- Deleted test survey (title='ed', description='dedf')
- Created 23 attendee_profiles for confirmed registrations (is_visible=true)

---

## PAUL-REQUIRED before Civitas demo

1. ~~**`supabase db push`**~~ — **DONE 2026-05-13**: migrations 0019–0028 applied to prod via psql
   - Note: .env.local URL is malformed (`$@` shell-expanded) — use: `PGPASSWORD='ERg*?Z6grtE5nH$' psql -h db.jmhxyyrleipcorvkmxfk.supabase.co -p 5432 -U postgres -d postgres`
2. **Vercel env vars:**
   - `ADMIN_EMAILS` = `sowu.paul@gmail.com,paul@prezva.app`
   - `NEXT_PUBLIC_APP_URL` = `https://prezva.app`
3. **Supabase Auth SMTP** → switch to Resend (smtp.resend.com, port 465) to lift 3/hr email limit
4. **Google OAuth app** → register in Google Cloud Console, then set `NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED=1` + client ID/secret in Vercel
5. **Apple Developer enrollment** (D-U-N-S 127451051) — unlocks Wallet + App Store
6. **Google Play Console enrollment** — unlocks Google Wallet + Play Store
7. **Push integration env vars** — Zoom, Mailchimp, Eventbrite, CC (in credentials.md)

---

## Next sprint options (decide)
- **Sprint 28A: Operational visibility** — email confirmations (Resend), billing UI, Supabase Realtime
- **Sprint 28B: GHL branch** — continue feature/ghl-integration (contact sync, tag triggers, deal pipeline)

---

## Key build facts (carry forward)

- Build command: `next build` (Turbopack via next.config.ts; no --webpack)
- No shadcn/ui — plain HTML + Tailwind + inline styles with CSS vars (`--pz-bg`, `--pz-surface`, etc.)
- `requireUser()` returns user directly (not `{ user }`)
- `params` in pages/routes: `Promise<{ slug: string }>` — always `await params`
- Admin client: `createAdminClient()` server-side only — comment `// Admin client: <reason>`
- Zod uses `.issues[0].message` not `.errors[0].message`
- Integration test stable IDs:
  - userId: `639b6098-8be3-44c3-91a3-7b4c43c5dc9b`
  - orgId: `4ab17b77-4f76-4091-b0cc-509045cb9998`
  - eventId: `a8a984c8-27f3-4391-ba40-ebedfaeb279d`
  - ticketFreeId: `6fc9db3d-b5c2-4dde-8754-73d5473466cd`
  - ticketPaidId: `fc0dc49e-54ae-4297-a913-3d621c3bfd04`
- Stripe SDK v22, API `2026-04-22.dahlia`
- Supabase project: `jmhxyyrleipcorvkmxfk`
