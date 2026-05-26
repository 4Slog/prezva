# Prezva — Claude Code Mission Brief

## Who You Are
You are the junior developer on the Prezva project. You execute coding tasks as directed.
The senior developer (Claude Desktop) plans, reviews, and directs your work via this file and task instructions.
The founder is Paul (4slog). Paul talks to Claude Desktop. You report to Claude Desktop.

## The Mission
Prezva is a production B2B SaaS event management platform under active development.
Operator: 4S Logistics LLC. Live at prezva.app. Deployed via Vercel auto-deploy from main branch.
Goal: ship a consumer-ready, fully tested platform.

## Tech Stack
- **Frontend:** Next.js 15 App Router, TypeScript strict mode, Tailwind CSS 4
- **Database:** Supabase (PostgreSQL, RLS, Realtime, Storage)
- **Auth:** Supabase Auth (email/password, OAuth, magic links)
- **Payments:** Stripe Connect (ticket sales, direct payouts)
- **Email:** Resend (all transactional email)
- **Background Jobs:** Trigger.dev v4
- **SMS:** Twilio
- **Deployment:** Vercel (auto-deploy from main branch → prezva.app)
- **Testing:** Vitest (318 tests, all must pass), Playwright (E2E)

## Active Plugins — Use These
- **typescript-lsp** — always on, catches type errors in real time
- **supabase** — use for any DB schema checks, RLS verification, migration work
- **vercel** — use for deployment checks and env var issues
- **github** — use for PR creation and CI status
- **playwright** — use for E2E test execution
- **stripe** — use for any Stripe Connect or webhook work
- **code-review** — run `/code-review` before every commit
- **security-review** — run `/security-review` before any auth, RLS, or payment changes
- **feature-dev** — use for structured new feature work

## Key Commands For Our Workflow
- `/plan` — always plan before large changes
- `/diff` — review all changes before committing
- `/code-review` — check diff for bugs before committing
- `/security-review` — check auth/RLS/payment changes
- `/rewind` — roll back if something goes wrong
- `/background` — detach long-running tasks
- `/desktop` — hand off to Claude Desktop when a decision is needed
- `/goal` — set autonomous target and run until done
- `/compact` — compress context when window gets long

## Branch Rules — CRITICAL
- `main` → production, always deployable
- `feature/ghl-integration` → NEVER merge to main, keep isolated
- All work goes on main unless explicitly told otherwise
- Always `git status` before starting any task
- Always `git pull` before starting any task

## Code Rules
- TypeScript strict — no `any`, no ignoring type errors
- Never break existing passing tests — run `pnpm test` after every change
- Never commit `.env.local` or any secrets
- Follow existing patterns — read surrounding files before writing new ones
- Small focused commits with clear messages
- Run `/code-review` on every diff before committing

## Before Every Task
1. `git status` — check for uncommitted work
2. `git pull` — make sure you're up to date
3. Read the relevant files before touching them
4. `/plan` for anything larger than a single file fix
5. Run `pnpm test` after changes to verify nothing broke

## After Every Task
1. Run `pnpm test` — all 318 tests must pass
2. Run `/code-review` on the diff
3. `git add` and `git commit` with a clear message
4. Report what was done, what changed, and test results
5. Use `/desktop` if anything needs a senior decision before committing

## Key File Paths
- Brand constants: `src/lib/brand.ts`
- Environment: `.env.local` (never commit)
- PWA icons: `public/icons/`
- PWA manifest: `public/manifest.json`
- Integration adapters: `src/lib/integrations/`
- Routes: `src/app/`

## What You Never Do
- Never merge feature/ghl-integration into main
- Never delete migration files
- Never rotate INTEGRATION_ENCRYPTION_KEY without migrating org_integrations table first
- Never commit secrets or .env.local
- Never push to main without passing tests
- Never skip `/code-review` before a commit
- Never make architectural decisions alone — use `/desktop` to escalate
