# Xekin — Session Notes
# Read this at the START of every build session before doing anything.
# Update this at the END of every build session.

---

## Current Phase
**Pre-Build Foundation — COMPLETE ✅**
Next: PHASE 1 — Schema & Database

## Last Session
Date: May 9 2026

## What Was Completed This Session
- Next.js 14 scaffolded at ~/Xekin/dev/ (TypeScript, Tailwind, App Router, src/)
- GitHub repo created: github.com/4Slog/xekin (private)
- Branches created: main, staging, dev (all pushed to GitHub)
- All core dependencies installed: Supabase, Stripe, Resend, React Hook Form, Zod, Zustand, TanStack Query
- Dev dependencies installed: Vitest, Playwright, Testing Library
- Supabase client files created: src/lib/supabase/client.ts, server.ts, middleware.ts
- next.config.ts configured (security headers, image domains)
- vitest.config.ts configured
- package.json scripts updated (dev on port 3100, test, type-check, validate)
- .env.example created (template for all required keys)
- .gitignore updated (never commit .env*.local)
- vercel.json created (ready to link when Vercel login done)
- GitHub Actions CI workflow: lint + type-check + unit tests + security audit
- supabase/migrations/ folder created (ready for 0001_initial_schema.sql)
- Build passes clean: next build ✅
- Environment validation: 42 PASS / 2 WARN / 0 FAIL ✅

## Decisions Made
- ALL code lives on lin at ~/Xekin/dev/ — Mac is browser only (http://10.0.0.60:3100)
- Stack: Next.js 14 + TypeScript + Tailwind + shadcn/ui + Supabase + Stripe + Resend + Expo
- Dev port 3100 | Staging 3101 | Storybook 6006

## Still Needs Manual Action (Paul must do these)
1. Create Supabase project 'xekin-staging' at supabase.com → save URL + anon key + service role key to ~/.claude/global-memory/credentials.md and to ~/Xekin/dev/.env.local
2. Create Supabase project 'xekin-prod' at supabase.com → save to credentials.md (do NOT put prod keys in .env.local)
3. Connect GitHub repo to Vercel (go to vercel.com → Import → 4Slog/xekin)
4. Buy domains: xekin.app (primary), xekin.com, xekin.io
5. Register @xekin social handles
6. Form Alabama LLC + EIN + bank account
7. Termly Privacy Policy + ToS (0/mo)
8. Cyber liability insurance

## Next Action (first thing next build session)
Once Supabase projects are created and .env.local is filled in:
→ Start PHASE 1 — Schema
→ Write 0001_initial_schema.sql covering ALL tables (see Whova blueprint for full list)
→ Apply to xekin-staging first, verify, then prod

## Validation Status
Last run: May 9 2026 — 42 PASS, 2 WARN, 0 FAIL
Warnings: .env.local missing (fill in Supabase keys), dev server not running (start when needed)
