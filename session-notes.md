# Prezva Session Notes

## Last updated: 2026-05-11

## Current state

- **Branch:** `sprint16-pwa-expo` — COMPLETE, commit d70968a
- **Tests:** 189/189 unit + 23/23 integration (gate: 12 PASS, 1 WARN = pre-existing npm vulns)
- **Integration providers:** 16 total (Sprints 13-15)
- **Expo wrapper:** ~/Prezva/expo/ (outside dev git repo, not tracked in GitHub)

## Sprint 16 — COMPLETE ✅

All Sprint 16 tasks done:
- T-122: SyncHealthPill wired to navigator.onLine + Dexie pending count (lazy useState init)
- T-123/a/b/c: next-pwa service worker, manifest.json, icons (192/512/maskable), iOS install prompt, Workbox caching
- T-124: VAPID push subscriptions table (migration 0017), PushSubscriber component, sendAnnouncementPush
- T-125: audit_logs table (migration 0017 combined), logAudit helper, writes in org/event/attendee actions
- T-125a: OfflineIndicator fixed-top banner
- T-140: Expo webview wrapper at ~/Prezva/expo/ (blank-typescript, react-native-webview)
- T-140a: expo-notifications native push bridge with token injection into WebView
- T-140b: eas.json with preview + production build profiles
- T-140c/d: Store submission prep docs in ~/Prezva/docs/store-submissions/ (deferred — Paul enrollment needed)

## Sprint 16 — Critical build fixes

- **next-pwa@5 + Next.js 16 Turbopack conflict:** Added `--webpack` to `package.json` build script. next-pwa v5 uses webpack plugins; Next.js 16 defaults to Turbopack for builds.
- **Uint8Array<ArrayBuffer>:** Use `new Uint8Array(n)` + for-loop instead of `Uint8Array.from()` in PushSubscriber.
- **Supabase `.in()` subquery:** Not type-safe — fetch IDs separately, then pass array.
- **ESLint setState in useEffect:** Use lazy `useState(() => navigator.onLine)` instead of sync setState in effect.
- **ESLint v9 ignores:** Use `globalIgnores([...])` in `eslint.config.mjs` — `.eslintignore` is deprecated.
- **Generated SW files:** Add `public/sw.js` etc. to both `.gitignore` AND `eslint.config.mjs` ignores.

## Next action: Sprint 17

**Brief:** `~/.claude/projects/-home-paul/memory/prezva_sprint_17_brief.md`

**Branch to create:** `sprint17-security-polish` from `sprint16-pwa-expo`

**Tasks:**
- T-126: 2FA for organizers (Supabase Auth MFA TOTP)
- T-126a: 2FA for attendees (optional/skip if tight)
- T-128: GDPR data export endpoint (GET /api/gdpr/export)
- T-129: GDPR data deletion endpoint (POST /api/gdpr/delete)
- T-130: Survey guest responses via token link (qr_code as token)
- T-131: Survey response CSV export (GET /api/events/[id]/surveys/[surveyId]/export)
- T-132: Duplicate of T-130 — mark ✅ when T-130 done
- T-133: In-app help center /help page (shadcn Accordion, static content)
- T-134: Setup checklist component on dashboard (new org / 0 events)
- T-135: Uptime monitoring doc (~Prezva/docs/ops/uptime-monitoring.md)
- T-136: SOC 2 prep doc (~Prezva/docs/ops/soc2-prep.md)
- T-137: SPF/DKIM/DMARC doc (~Prezva/docs/ops/email-authentication.md)
- T-138: E2E Playwright tests (e2e/ — 9 tests E2E-01 through E2E-09)
- T-139: Seed script (scripts/seed.ts — uses service role key to bypass RLS)

## Completed sprints
- S1: Schema reconciliation | S2: Integration test gate | S3: Feature delivery
- S4: UX polish | S5: Registration depth | S6: Agenda depth
- S7: Check-in depth | S8: Speakers + networking | S9: Email + notifications
- S10: Survey depth | S11: Productivity tools | S12: Apple/Google Wallet
- S13: Integrations P1 (Outlook, Zoom, Teams) | S14: Integrations P2 (Drive, SP, Mailchimp, CC, GForms, EB)
- S15: Integrations P3 (7 association adapters + mgmt UI + member gating)
- S16: PWA + Expo (service worker, VAPID push, audit log, offline indicators, Expo wrapper)
