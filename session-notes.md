# Prezva — Session Notes
# Read this at the START of every build session before doing anything.
# Update this at the END of every build session.

---

## Current Phase
**Phase 1 — Organizations (Task 24)**
Next task: Org API routes, invite flow, org switcher, settings page

## Last Session
Date: May 9 2026

## Completed This Session
### Pre-Build Foundation ✅
### Phase 1 Schema ✅ (0001_initial_schema.sql — 23 tables)
### Phase 1 RLS ✅ (0002_rls.sql — 75 policies, 4 helper functions)
### Task 21 — CI/CD Gate ✅
### Task 22 — Auth Module ✅ (82/82 tests, CI green)
### Rename: Xekin → Prezva ✅
- GitHub: 4Slog/prezva
- Vercel project: prezva
- Supabase project display: prezva (ID unchanged)
- Lin folder: ~/Prezva/
- prezva.app DNS → Vercel (A: 76.76.21.21)
- prezva.com → 301 redirect to prezva.app
- All source files, scripts, docs updated

## Locked Decisions
- ALL code on lin ~/Prezva/dev/ — Mac is browser only (http://10.0.0.60:3100)
- Auth pages: useActionState (client components)
- redirect() uses plain strings — typedRoutes disabled
- Lint: eslint src/ --ext .ts,.tsx --max-warnings 0
- Write SQL/files via paramiko SFTP — never bash heredoc (PID contamination)
- DB push URL: postgresql://postgres:ERg%2A%3FZ6grtE5nH%24@db.jmhxyyrleipcorvkmxfk.supabase.co:5432/postgres
- After new pages: npm run build FIRST, then npm run type-check

## Task 24 — Orgs (Next)
1. POST /api/orgs — create org + auto-add creator as owner in org_members
2. GET /api/orgs — list authenticated user's orgs
3. PATCH /api/orgs/[id] — update settings (owner only)
4. POST /api/orgs/[id]/invite — send email invite, create pending org_members row
5. Org switcher component (dropdown in nav header)
6. /dashboard/settings page (org profile edit)
7. Tests + gate check

## Upcoming Tasks (Phase 1)
25 → Events | 28 → Tickets | 33 → Registration+Stripe | 38 → Attendees
47 → QR Check-in (offline-first) | 62 → Agenda | 68 → Speakers
72 → Attendee web app | 78 → Announcements | 83 → Messaging
87 → Surveys | 91 → Analytics | 97 → Phase 1 system tests + gate

## Audit Gaps to Add (from Master Plan Audit review)
- Background job queue (Trigger.dev/Inngest) — add before Task 33 Registration
- Database seed script (Faker.js) — add before testing at scale
- i18n foundation (next-intl) — add during Phase 1 Polish

## Validation Status
Last: May 9 2026 — 45 PASS, 1 WARN (dev server not running), 0 FAIL
Tests: 82/82 passing
CI: green ✅ | Vercel: prezva.app live ✅

## Task 24 — Organizations — COMPLETE ✅ (May 9 2026)

### Files created (11)
- src/lib/orgs/actions.ts — createOrg, updateOrg, inviteMember, removeMember, acceptInvite, getUserOrgs, getOrgBySlug
- src/app/api/orgs/route.ts — POST (create) + GET (list)
- src/app/api/orgs/[id]/route.ts — GET + PATCH
- src/app/api/orgs/[id]/invite/route.ts — POST invite
- src/app/api/orgs/[id]/members/route.ts — GET members
- src/components/orgs/OrgSwitcher.tsx
- src/components/orgs/InviteForm.tsx
- src/components/orgs/MemberList.tsx
- src/app/(dashboard)/orgs/new/page.tsx
- src/app/(dashboard)/orgs/[slug]/settings/page.tsx
- src/__tests__/orgs.test.ts (12 tests)

### Test totals: 94/94 passing
### Build validator: 12 PASS / 0 WARN / 0 FAIL
### Commit: 8446469 — pushed to main, Vercel deploying

### Notes
- Zod v4 uses .issues[0].message not .errors[0].message
- vi.clearAllMocks() resets mockResolvedValue — use mockReset + re-install in beforeEach
- mockFrom needs full chain shape for TypeScript even in conditional branches

### Next: Task 25 — Org-level roles enforcement (owner/admin/staff gates on event creation)
   OR skip to Task 28 — Events module (create event, lifecycle, settings)
   Ask Paul which to tackle next.
