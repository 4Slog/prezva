# Prezva — Claude Tooling Workflow

This document describes how all Claude instances work together on the Prezva project.
Read this before starting any session.

---

## The Stack — All Available Claude Tools

### 1. Claude Web (claude.ai)
- **Role:** Primary coordination, planning, analysis, testing brain
- **Has access to:** Project knowledge files, persistent memory, past conversation transcripts, MCP tools
- **Does:** Planning, writing Claude Code prompts, running browser tests, DB queries, file reads, bug triage, checklist tracking
- **Cannot:** Edit files directly — all file changes go through Claude Code
- **MCP tools available:** Claude in Chrome, Desktop Commander, Supabase MCP, Vercel MCP, Gmail, Google Drive, Google Calendar, Spotify, Uber, Uber Eats, Expedia, Microsoft 365, Intuit Credit Karma, Microsoft Learn, Canva

### 2. Claude Code (terminal on Mac)
- **Invoked:** `cd ~/Prezva/dev && claude --dangerously-skip-permissions`
- **Role:** All file edits, git, migrations, shell commands, test runs, builds
- **Has access to:** Full filesystem, all shell commands, npm/pnpm/supabase CLI
- **Does:** Reads files → edits → runs tsc/tests → applies migrations → commits → pushes
- **When to use:** Any time files need to change, tests need to run, migrations need applying, or git ops needed
- **Pattern:** Claude web writes prompt → Paul pastes into terminal → Claude Code runs autonomously → reports back

### 3. Claude in Chrome (MCP browser extension)
- **Role:** UI clickthrough testing and visual verification
- **Has access to:** Any website the browser can reach
- **Blocked from:** checkout.stripe.com, external OAuth flows, sites requiring CAPTCHA
- **Used for:** Persona clickthroughs, form submissions, visual regression, screenshot capture
- **Invoked:** Automatically by Claude web via MCP tools (no manual step needed)

### 4. Desktop Commander (MCP)
- **Role:** SSH, file system ops, process management on Mac and remote servers
- **SSH hosts:** `casa` = casadesowu.com (main server), `len`, `win` (no `lin` alias — use `casa`)
- **Used for:** Running DB queries via supabase CLI, reading .env files, managing tmux sessions, scp transfers
- **Key pattern for long commands:** `start_process` for non-interactive, `interact_with_process` for interactive/REPL

### 5. Supabase MCP (connected)
- Direct Supabase project access — can query DB, run migrations, inspect schema
- Use for: DB state verification, quick queries, schema checks

### 6. Vercel MCP (connected)
- Direct Vercel deployment access — env vars, deployment status, logs
- Use for: Checking deploy status after push, managing environment variables

---

## The Workflow

```
Claude web analyzes situation
    ↓
Writes Claude Code prompt in standard format (see below)
    ↓
Paul pastes prompt into Claude Code terminal
    ↓
Claude Code does PRE-WORK only — reads files, runs checks, reports findings
    ↓                    ← STOP HERE — Claude Code reports back
Paul pastes findings back to Claude web
    ↓
Claude web reviews findings, approves or adjusts the plan
    ↓
Paul pastes "proceed" or adjusted instructions back to Claude Code
    ↓
Claude Code executes tasks (edits → tsc → tests → migrate → commit → push)
    ↓
Claude Code reports results
    ↓
Paul pastes results back to Claude web
    ↓
Claude web verifies, updates checklist, continues
```

---

## Standard Claude Code Prompt Format

All Claude Code prompts follow this structure. The key rule: **Claude Code STOPS after PRE-WORK and reports findings before touching any files.**

```
/[sprint-or-fix-name] — [short description]
Read all referenced files before touching anything.
Gates must pass: npm run build, npx vitest run, npx tsc --noEmit

--- PRE-WORK: READ THESE FILES FIRST ---
1. [file path] — [what to look for]
2. [file path] — [what to look for]
...

Run these checks:
   [grep or shell commands to gather facts]

Report all findings before writing any code.
**STOP HERE AND WAIT FOR APPROVAL BEFORE PROCEEDING.**

--- TASK 1: [TASK NAME] ---
[Exact description of what to change and why]
[Specific lines/patterns to find]
[Exact behavior expected after fix]

--- TASK 2: [TASK NAME] ---
[Same structure]

--- AFTER ALL TASKS ---
Run gates:
1. npm run build
2. npx vitest run  
3. npx tsc --noEmit

Commit: git add -A && git commit -m "[message]" && git push origin main

Print summary table:
| Task | Finding | Fix applied |
|------|---------|-------------|
```

### Key rules for good prompts:
1. **PRE-WORK section always comes first** — files to read, grep commands to run
2. **STOP after PRE-WORK** — Claude Code reports findings, Claude web approves before execution
3. **Be specific about files** — exact paths, not "find where X is"
4. **Verification gates** — tsc, tests, build before every commit
5. **Migration step** — `supabase db push --linked` if schema changes
6. **Exact commit message** — tell it exactly what to write

---

## Key File Paths

```
src/app/api/webhooks/stripe/route.ts     — Stripe webhook handler
src/lib/registration/actions.ts          — Public registration flow (free + paid)
src/lib/registrations/actions.ts         — Admin registration actions (refund, cancel, check-in)
src/lib/trigger.ts                       — Trigger.dev job enqueuers
src/trigger/jobs/registration.ts         — Confirmation email job
src/trigger/jobs/announcement.ts         — Announcement email job
src/trigger/jobs/volunteer-invite.ts     — Volunteer invite email job
src/trigger/jobs/speaker-invite.ts       — Speaker invite email job
src/app/(dashboard)/events/[slug]/       — All event admin pages
src/app/(dashboard)/orgs/[slug]/         — All org admin pages
src/app/e/[slug]/                        — All public event pages
supabase/migrations/                     — DB migrations
trigger.config.ts                        — Trigger.dev project config
```

## Key Environment Variables (.env.local)
```
SUPABASE_SERVICE_ROLE_KEY         — Admin DB access
STRIPE_SECRET_KEY                 — sk_live_... or sk_test_... (swap for Block 2 testing)
STRIPE_WEBHOOK_SECRET             — whsec_... (local listener secret)
TRIGGER_SECRET_KEY                — tr_prod_... (job enqueueing)
RESEND_API_KEY                    — re_... (email sending)
NEXT_PUBLIC_APP_URL               — https://prezva.app
```

## Active Test Environment
```
Dev server:        pnpm dev -p 3100  (localhost:3100)
Webhook listener:  stripe listen --forward-to http://localhost:3100/api/webhooks/stripe
Test Stripe acct:  acct_1Tbio36dY6OjRWK4
Test keys:         swap STRIPE_SECRET_KEY to sk_test_... and back when done
```

## Servers & SSH
```
casa  = paul@casadesowu.com  (main Linux server, ~/Prezva/dev is the codebase mirror)
len   = separate server
win   = Windows server
```

## tmux Sessions (on casa)
```
logo-update   — logo integration work (in progress)
sprint27/28/29 — completed sprints
```

## Test Accounts (created during Phase 2 testing)
```
neworg.test@prezva-test.com  / TestOrg2026!   — new organizer, org: test-association-phase2
orgadmin.test@prezva-test.com / TestAdmin2026! — admin role on gapp-test
orgstaff.test@prezva-test.com / TestStaff2026! — staff role on gapp-test
sowu.paul@gmail.com / Prezva2026!              — owner of gapp-test (main test account)
```
