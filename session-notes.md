# Xekin — Session Notes
# Read this at the START of every build session before doing anything.
# Update this at the END of every build session.
# Keep it short — decisions, state, next action only.

---

## Current Phase
Pre-Build Foundation — COMPLETE. Ready for first build session.

## Last Session
Date: May 9 2026 (full planning + pre-build setup session)

## What Was Completed This Session
- Complete Whova competitive teardown and feature inventory (150+ features documented)
- Full OSS stack selected and documented (35+ libraries, all MIT)
- Reliability, PII, offline-first architecture decisions finalized
- Master Build Plan created (13 Phase 1 modules, gate checks, sub-agent roles)
- Master Plan Audit completed (30+ gaps identified and resolved)
- All 5 strategy docs saved to ~/Xekin/docs/ on lin
- GitHub CLI authenticated on lin as 4Slog
- All dev tools verified: Node 24, Supabase CLI 2.98, k6, PM2, Docker, Vitest, Playwright
- Validation infrastructure built and tested: environment.sh, build.sh, rls.sh, all.sh (36 PASS 0 FAIL)
- PostToolUse hook added to ~/.claude/settings.json (fires on every Write/Edit/Bash)
- inotifywait watcher running as systemd service xekin-watcher.service (auto-starts on boot)
- post_task.sh created — fires validator, logs to ~/Xekin/logs/, writes last_validation.json
- CLAUDE.md updated on lin root, lin global, Mac global — all Xekin-aware
- ~/Xekin/dev/CLAUDE.md created (143 lines — full project instructions)
- Session Management rules added to all global CLAUDE.md files (/compact, batch, no thank-yous)
- /save command created globally (~/.claude/commands/) and in project (dev/.claude/commands/)
- Birmingham Small Business Week context captured — Whova used there, validated the market
- WhatsApp bridge confirmed running on lin port 8100 (ready: true) — future Xekin integration
- Xekin named, branded, positioned — "Check In", ZEH-kin, tagline options documented

## Decisions Made (never revisit these)
- ALL code lives on lin at ~/Xekin/dev/ — Mac is browser only (http://10.0.0.60:3100)
- Production hosting: Vercel (SOC 2) + Supabase cloud (SOC 2 Type II) — lin = dev/staging only
- Stack: Next.js 14 + TypeScript + Tailwind + shadcn/ui + Supabase + Stripe + Resend + Expo
- Offline-first check-in: Dexie.js (IndexedDB) + Workbox service worker + WatermelonDB mobile
- Background job queue: Trigger.dev or Inngest — decide in first build session
- Feature flags: PostHog or custom Supabase table — decide in first build session
- Dev port 3100 | Staging 3101 | Storybook 6006
- Conventional commits enforced: feat: fix: chore: docs: test: perf:
- Sonnet 4.6 for ALL build sessions — do not switch to Opus
- No AI needed for MVP — add Claude API features in Phase 2 only
- Audit logs table required from day one (GDPR compliance)
- Supabase RLS on every table — no exceptions
- lin is NOT for production data — PII stays on Supabase cloud only
- WhatsApp bridge (port 8100) available for future event notification feature
- OpenPencil + Penpot added to Useful Tools — use after backend for UI/mobile design

## Pre-Build Todo — Status
- #1 CLAUDE.md files ✅ COMPLETE
- #2 Session Management Protocol ✅ COMPLETE
- #C Unified Memory ✅ ALREADY EXISTED — marked complete
- #4 Self-Validation hooks ✅ COMPLETE
- /save command ✅ COMPLETE

## Still To Do Before First Line of Code
1. Buy domains: xekin.app + xekin.com + xekin.io + xekin.co
2. Start Alabama LLC formation (~$200 + $100/yr)
3. Apply for EIN (free, IRS online)
4. USPTO trademark search for "Xekin"
5. Register @xekin social handles everywhere
6. Create Supabase project xekin-prod + xekin-staging (save keys to credentials.md)
7. Create GitHub repo xekin (private) under 4Slog — gh repo create
8. Initialize Next.js 14 in ~/Xekin/dev/
9. Set up GitHub Actions CI/CD pipeline
10. Initialize Storybook on port 6006
11. Choose background job queue (Trigger.dev vs Inngest)
12. Choose feature flag system (PostHog vs custom)
13. Privacy Policy + ToS via Termly ($10/mo)
14. Cyber liability insurance ($50-100/mo)
15. Add audit_logs table to schema from day one
16. Create database seed script with Faker.js
17. Add Xekin block to win CLAUDE.md when win comes back online
18. Receive Whova admin credentials → run competitive teardown → save to ~/Xekin/teardown/

## Next Action (first thing in new build chat)
Say: "Read session-notes.md" — then start with item #6:
Create Supabase projects xekin-prod and xekin-staging, save credentials to
~/.claude/global-memory/credentials.md, then initialize the Next.js project.

## Validation Status
Last run: May 9 2026 — 36 PASS, 0 FAIL, 4 WARN
Warnings are expected — clear when project is initialized (package.json, .env.local, git repo, dev server)
Watcher: xekin-watcher.service RUNNING — fires on file changes in ~/Xekin/dev/src/
Hook: PostToolUse in ~/.claude/settings.json — fires on every Claude Code Write/Edit/Bash
