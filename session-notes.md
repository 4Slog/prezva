# Prezva Session Notes

## Last updated: 2026-05-13

## Status: Sprint 28 complete ✅ | Branch: main | Tag: sprint28-complete

318 unit tests passing. Gate: 12 PASS 0 FAIL 1 WARN (1 warn = npm audit high vulns, pre-existing). Commit: df64f83

---

## What was just completed (Sprint 28 — Bug Fix Sprint)

### Critical fixes
- **T-2801**: Removed `'use server'` from `src/lib/public/actions.ts` — fixes notFound() on public event pages
  - Split `toggleBookmark` to `src/lib/public/bookmark-actions.ts` (separate `'use server'` file — required because agenda/client.tsx calls it from a client component)
  - Updated `src/app/e/[slug]/agenda/client.tsx` to import from `bookmark-actions.ts`
- **T-2802**: Created `src/app/(dashboard)/orgs/[slug]/page.tsx` — redirects to settings
- **T-2803**: Created `src/app/(dashboard)/events/[slug]/certificates/page.tsx` — template list + empty state
- **T-2805**: Catch Postgres 23505 in `createOrg()` → friendly slug collision message (actions.ts + UI)
- **T-2806**: Created announcement detail/edit page at `events/[slug]/announcements/[id]/page.tsx`; wrapped cards in Link

### Templates
- **T-2807**: Created `src/lib/templates/apply-starter.ts`; wired into `events/new/page.tsx` via `applyStarterAction` server action wrapper in `src/lib/events/actions.ts`

### UX / data fixes
- **T-2808**: OrgSwitcher — `activeSlug` state tracks selection immediately (no wait for nav)
- **T-2809**: Dashboard greeting fetches `profiles.full_name` — shows first name not email
- **T-2810**: TIMEZONE_MAP added to `events/[slug]/page.tsx` — maps "Central (CT)" → "America/Chicago" etc.
- **T-2811**: Check-in denominator queries `registrations` table with `status='confirmed'` (was volunteers.length)
- **T-2812**: Create org button now teal (CSS var) not blue (bg-blue-600)
- **T-2814**: Created `src/app/not-found.tsx` — branded 404 with teal button
- **T-2815**: ENGAGEMENT section open by default in `AdminTileGrid.tsx`
- **T-2816**: Integrations page shows "Coming soon" (disabled) button for all unconfigured integrations
- **T-2817**: Active Sessions shows "0" not "—" for new orgs
- **T-2818**: Org slug auto-gen uses controlled React state with `slugTouched` boolean

### Additional fixes (not in brief but required for build)
- `src/app/api/webhooks/stripe/route.ts` — removed `export const config = { api: { bodyParser: false } }` (Pages Router syntax breaking Turbopack)
- `src/components/orgs/MemberList.tsx` — eslint-disable for `Date.now()` in map callback (react-hooks/purity)

### Test fixes
- `checkin.test.ts` — updated mocks for new `getCheckInStats` query pattern (registrations + check_ins count queries)
- `orgs.test.ts` — added `createAdminClient` mock
- `sprint23.test.ts` — sidebar nav items check now reads `Sidebar.tsx` (not layout.tsx)
- `public.test.ts` — `toggleBookmark` import updated to `bookmark-actions`

---

## PAUL-REQUIRED before Civitas demo (carried over from Sprint 27)

1. **Vercel env vars:**
   - `ADMIN_EMAILS` = `sowu.paul@gmail.com,paul@prezva.app`
   - `NEXT_PUBLIC_APP_URL` = `https://prezva.app`
   - **T-2804 (ENV-01):** Replace STRIPE_SECRET_KEY `rk_live_...` with `sk_live_...` → Redeploy
2. **Supabase Auth SMTP** → switch to Resend (smtp.resend.com, port 465) to lift 3/hr email limit
3. **Google OAuth app** → register in Google Cloud Console, then set `NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED=1` + client ID/secret in Vercel
4. **Apple Developer enrollment** (D-U-N-S 127451051) — unlocks Wallet + App Store
5. **Google Play Console enrollment** — unlocks Google Wallet + Play Store
6. **Push integration env vars** — Zoom, Mailchimp, Eventbrite, CC (in credentials.md)

---

## Next sprint options

- **Sprint 29A**: Email confirmations (Resend), billing UI, Supabase Realtime
- **Sprint 29B**: GHL branch — continue feature/ghl-integration (contact sync, tag triggers)
- **Sprint 29C**: Mobile (Expo) Phase 2 start

---

## Key build facts (carry forward)

- Build command: `next build` (Turbopack via next.config.ts; no --webpack)
- No shadcn/ui — plain HTML + Tailwind + inline styles with CSS vars (`--pz-bg`, `--pz-surface`, etc.)
- `requireUser()` returns user directly (not `{ user }`)
- `params` in pages/routes: `Promise<{ slug: string }>` — always `await params`
- Admin client: `createAdminClient()` server-side only — comment `// Admin client: <reason>`
- Zod uses `.issues[0].message` not `.errors[0].message`
- `toggleBookmark` lives in `src/lib/public/bookmark-actions.ts` (NOT `public/actions.ts`) — has `'use server'`
- `createEvent` now returns `{ id, slug }` instead of redirecting — caller must do `window.location.href`
- Integration test stable IDs:
  - userId: `639b6098-8be3-44c3-91a3-7b4c43c5dc9b`
  - orgId: `4ab17b77-4f76-4091-b0cc-509045cb9998`
  - eventId: `a8a984c8-27f3-4391-ba40-ebedfaeb279d`
  - ticketFreeId: `6fc9db3d-b5c2-4dde-8754-73d5473466cd`
  - ticketPaidId: `fc0dc49e-54ae-4297-a913-3d621c3bfd04`
- Stripe SDK v22, API `2026-04-22.dahlia`
- Supabase project: `jmhxyyrleipcorvkmxfk`
