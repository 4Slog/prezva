# Xekin — Session Notes
# Read this at the START of every build session before doing anything.
# Update this at the END of every build session.

---

## Current Phase
**Phase 1 — RLS (Row Level Security)**
Next task: Write 0002_rls.sql — RLS policies on all 23 tables

## Last Session
Date: May 9 2026

## What Was Completed This Session
### Pre-Build Foundation ✅
- Next.js 14 scaffolded at ~/Xekin/dev/
- GitHub repo: github.com/4Slog/xekin (private), branches: main, staging, dev
- All deps installed (Supabase, Stripe, Resend, Zod, Vitest, Playwright, etc.)
- Supabase client/server/middleware files created
- next.config.ts, vitest.config.ts, .env.example, vercel.json configured
- GitHub Actions CI pipeline live
- Vercel auto-deploy working (fixed commit author email)
- Supabase xekin project connected, .env.local written
- Validator: 44 PASS / 0 FAIL

### Phase 1 — Schema ✅
- 0001_initial_schema.sql — 610 lines, applied to Supabase
- 23 tables live and verified (all REST 200 OK)
- 5 triggers, 20+ indexes, all enums defined
- Schema tests: 28/28 passing
- Build validator: 13 PASS / 0 FAIL
- Pushed to GitHub, Vercel auto-deployed

## Decisions Made (never revisit)
- ALL code on lin ~/Xekin/dev/ — Mac is browser only (http://10.0.0.60:3100)
- Stack: Next.js 14 + TypeScript + Tailwind + shadcn/ui + Supabase + Stripe + Resend
- Ports: dev=3100, staging=3101, Storybook=6006
- Commit email: sowu.paul@gmail.com (required for Vercel auto-deploy)
- Supabase DB URL encoding: ERg%2A%3FZ6grtE5nH%24 (URL-encoded password)
- Write trigger functions using Python heredoc — NOT bash heredoc (bash replaces 86433 with PID)

## Still Needs Manual Action (Paul)
1. Buy domains: xekin.app + xekin.com + xekin.io
2. Register @xekin social handles
3. Form Alabama LLC + EIN + bank account
4. Termly Privacy Policy + ToS
5. Cyber liability insurance
6. Add Stripe keys to .env.local when ready
7. Add Resend key to .env.local when ready

## Next Action
Start Phase 1 Task 20: RLS policies
- Write supabase/migrations/0002_rls.sql
- Enable RLS on all 23 tables
- Policies: users see own data, org members see org data, public sees published events
- Run rls.sh validator after applying

## Validation Status
Last run: May 9 2026 — 13 PASS, 0 WARN, 0 FAIL (build.sh schema)
Environment: 44 PASS, 2 WARN (dev server not running — expected), 0 FAIL
