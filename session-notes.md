# Prezva Session Notes

## Last updated: 2026-05-13

## Status: PHASE 1 V2 LAUNCH-READY ✅

Tag: `phase-1-v2-launch-ready` (commit `5e80ba3`)
293 unit + 23 integration + 63 E2E tests. Smoke 27/27.

---

## What was just completed (Sprint 26)

### T-340: 4 E2E specs (63 tests)
- `e2e/full-organizer-journey.spec.ts` — 20 tests: auth gates, form rendering, auth-required pages
- `e2e/full-attendee-journey.spec.ts` — 23 tests: all public /e/[slug] surfaces, ICS download, anon behavior
- `e2e/full-sponsor-journey.spec.ts` — 10 tests: sponsors on public page, API protection, new tables don't crash
- `e2e/check-in-day.spec.ts` — 20 tests: check-in gates, API rejection, manifest, no JS errors

### T-341: Migration 0027
- `supabase/migrations/0027_sprint26_civitas_seed_reset.sql`
- Cleans audit test registrations, preserves stable IDs (org `4ab17b77`, event `a8a984c8`, user `639b6098`, ticket IDs)
- Seeds: 5 speakers, 15 sessions (3 days), 8 attendees (3 checked in), NPS survey, community post, tracks + rooms
- Safe to re-run (ON CONFLICT DO NOTHING throughout)

### T-344: Tags
- `sprint26-complete` (not tagged, used `phase-1-v2-launch-ready` directly)
- `phase-1-v2-launch-ready` → commit `5e80ba3` pushed to origin

### T-345: Launch report
- `~/Prezva/docs/PHASE_1_V2_LAUNCH_REPORT.md`

---

## PAUL-REQUIRED before Civitas demo

1. ~~**`supabase db push`**~~ — **DONE 2026-05-13**: migrations 0019–0027 applied to prod via psql, 27/27 smoke green
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

---

## Next: Phase 2 scope (TBD after Civitas onboarding call)

- Resend email notifications (confirmations, reminders)
- Stripe billing / subscription management UI
- Native Expo mobile app (full rebuild from webview wrapper)
- Sponsor portal (guest-facing: magic link, booth, leads)
- Real-time updates (Supabase Realtime)
- Public event marketplace / discovery
