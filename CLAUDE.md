# Xekin — "Check In" Event Platform
# Project-Level Claude Code Instructions
# Read this file fully before doing anything in this project.
# Also read: ~/Xekin/dev/session-notes.md for current task state.

---

## What Xekin Is
A full-featured event management SaaS platform — a Whova competitor built for small/micro
businesses at a fraction of the cost. Pronounced ZEH-kin ("Check In").
- External-facing SaaS, white-labelable, resellable
- Stack: Next.js 14 + TypeScript + Tailwind CSS + shadcn/ui + Supabase + Stripe + Resend + Expo
- Mobile: React Native (Expo) — Phase 2
- AI features: Anthropic Claude API — Phase 2

---

## Machine Context
- This code runs on lin (casa — Ubuntu 24.04, 10.0.0.60)
- Dev server: port 3100 (`npm run dev -- -p 3100`)
- Staging: port 3101
- Storybook: port 6006
- Mac is browser-only — view at http://10.0.0.60:3100
- Never write files outside ~/Xekin/dev/ unless explicitly instructed

---

## File Structure
~/Xekin/
├── dev/                    ← YOU ARE HERE (all source code)
│   ├── CLAUDE.md           ← this file
│   ├── session-notes.md    ← READ THIS FIRST every session
│   ├── .claude/skills/     ← project skills (schema, checkin, security, test)
│   ├── .env.local          ← NEVER commit, NEVER read aloud
│   ├── .env.example        ← safe template, committed to git
│   ├── src/
│   │   ├── app/            ← Next.js App Router pages + API routes
│   │   ├── components/     ← React components (all in Storybook)
│   │   ├── lib/            ← utilities, supabase client, stripe, helpers
│   │   ├── types/          ← TypeScript type definitions
│   │   └── __tests__/      ← Vitest unit tests
│   ├── supabase/
│   │   └── migrations/     ← ALL schema changes as numbered SQL files
│   └── e2e/                ← Playwright end-to-end tests
├── docs/                   ← strategy docs (5 planning documents)
├── scripts/
│   └── validate/           ← environment.sh, build.sh, rls.sh, all.sh
├── design/                 ← mockups, exported assets
├── teardown/               ← Whova competitive analysis screenshots
└── logs/                   ← validation logs, dev server logs

---

## Supabase
- Production project: xekin-prod
- Staging project: xekin-staging (use for ALL testing — never test on prod)
- Credentials: ~/.claude/global-memory/credentials.md on lin
- ALWAYS run migrations on staging first, then prod
- ALWAYS enable RLS on every new table immediately after creation
- Migration naming: 0001_initial_schema.sql, 0002_add_sessions.sql, etc.

---

## Critical Rules
- Read files before editing — never propose changes blind
- NEVER commit .env.local or any file containing secrets
- NEVER use the production Supabase project for development or testing
- NEVER write directly to supabase prod without running on staging first
- NEVER skip gate checks — every module must pass tests before moving to next
- NEVER mark a task complete if validate/build.sh shows FAIL
- Prefer editing existing files over creating new ones
- Keep solutions simple — minimum complexity for the task

---

## After Every Code Change (MANDATORY)
Run: `bash ~/Xekin/scripts/validate/build.sh [module]`
Report the PASS/WARN/FAIL counts before saying the task is done.
If FAIL: fix it before reporting. Do not hand over broken code.

Modules: auth | schema | checkin | api | ui | all

---

## Testing Requirements
- Unit tests: Vitest — in src/__tests__/
- E2E tests: Playwright — in e2e/
- Load tests: k6 — in scripts/test/
- Every new feature needs unit tests BEFORE it is marked done
- Every API route needs a test case
- Run tests: `npx vitest run` (unit) | `npx playwright test` (E2E)

---

## Git & Deployment
- Branches: main (prod), staging, dev
- Never push directly to main — always PR from staging
- Branch protection on main: PR review required
- Conventional commits: feat: | fix: | chore: | docs: | test: | perf:
- Push to staging → Vercel preview URL generated automatically
- Push to main → Vercel auto-deploys to production
- GitHub: github.com/4Slog/xekin (private)

---

## Code Style
- TypeScript strict mode — no `any` types
- Named exports preferred over default exports for components
- File naming: kebab-case for files, PascalCase for components
- Tailwind CSS only for styling — no custom CSS files
- shadcn/ui for all UI primitives — run `npx shadcn@latest add [component]`
- Zod for all input validation
- React Hook Form for all forms
- TanStack Query for all data fetching

---

## Session Protocol
- Start every session: read session-notes.md first
- End every session: update session-notes.md with decisions made + next action
- Use /compact after completing each module — not reactively
- Use /clear when switching to completely unrelated work
- Batch related changes into one operation — no 5-message follow-up chains
- No thank-you messages — wastes tokens

---

## Build Phase
Check session-notes.md for current phase. Phases in order:
Pre-Build → Schema → RLS → CI/CD → Auth → Orgs → Events →
Registration → Agenda → Speakers → Attendees → Check-In →
Announcements → Attendee Web App → Messaging → Surveys →
Analytics → System Tests → Phase 1 Launch

---

## Memory & Docs
- Project memory: ~/.claude/global-memory/xekin_project.md
- Master build plan: ~/Xekin/docs/Xekin_Master_Build_Plan.docx
- Audit: ~/Xekin/docs/Xekin_Master_Plan_Audit.docx
- OSS guide: ~/Xekin/docs/Xekin_OSS_Costs_AI_Guide.docx
- Reliability: ~/Xekin/docs/Xekin_Reliability_PII_Offline.docx
- Whova research: ~/Xekin/docs/Xekin_Whova_DeepDive_Blueprint.docx
