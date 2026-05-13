# Prezva Session Notes

## Last updated: 2026-05-12

## Status: SPRINT 25 COMPLETE ✅

293 unit tests + 23 integration tests. Smoke 27/27. Tag: `sprint25-complete`.

---

## Branch state

- `main` — current, up to date with origin, tag `sprint25-complete` on commit `6d35f8b`

---

## Sprint 25 summary (just completed)

**Sponsor Module + Seed Data + Public Page Polish**

Files added/modified:
- `supabase/migrations/0025_sprint25_sponsors.sql` — event_sponsors, attendee_points, community_photos, icebreaker prompt column
- `supabase/migrations/0026_sprint25_seed.sql` — trivia, passport locations, demo sponsors for Birmingham SBW
- `src/lib/sponsors/actions.ts` — getSponsors, createSponsor, updateSponsor, deleteSponsor (Zod + assertOrgAdmin)
- `src/app/(dashboard)/events/[slug]/sponsors/page.tsx` — replaced stub with real page
- `src/app/(dashboard)/events/[slug]/sponsors/sponsors-client.tsx` — full tier CRUD UI
- `src/lib/public/actions.ts` — added getPublicSponsors
- `src/app/e/[slug]/page.tsx` — added sponsors section (tier-grouped, #sponsors anchor)
- `src/__tests__/sprint25.test.ts` — 13 tests

---

## Key build facts (carry forward)

- **Build command:** `next build` (no --webpack flag; Turbopack used via next.config.ts)
- No shadcn/ui — plain HTML + Tailwind + inline styles with CSS vars
- Zod uses `.issues[0].message` not `.errors[0].message`
- Admin client: `createAdminClient()` server-side only — comment `// Admin client: <reason>`
- `requireUser()` returns user directly (not `{ user }`)
- `params` in pages/routes: `Promise<{ slug: string }>` — always `await params`
- Stripe SDK v22, API `2026-04-22.dahlia`
- CSS custom properties: `--pz-bg`, `--pz-surface`, `--pz-teal`, `--pz-border`, `--pz-text`, `--pz-muted`
- Supabase project: `jmhxyyrleipcorvkmxfk`
- DB push: `supabase db push --db-url 'postgresql://postgres:ERg%2A%3FZ6grtE5nH%24@db.jmhxyyrleipcorvkmxfk.supabase.co:5432/postgres'`

---

## Pending deployment follow-ups (Paul-required)

1. Run migrations 0019-0026 on **production** Supabase
2. Add `ADMIN_EMAILS` env var to Vercel
3. Add `NEXT_PUBLIC_APP_URL=https://prezva.app` to Vercel
4. Fix `/sw.js` 404 — migrate to `@serwist/next` or commit manual `public/sw.js`
5. Push integration env vars to Vercel (Zoom, Mailchimp, Eventbrite, Constant Contact)
6. Apple Developer enrollment (D-U-N-S 127451051)
7. Google Play Console enrollment

---

## Next sprint candidates (Sprint 26)

- T-301: Button component + color system consolidation (low priority, deferred)
- Sprint 26 scope TBD — likely: email notifications (Resend), Stripe billing UI, or mobile Expo depth
