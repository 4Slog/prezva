# Prezva Session Notes

## Last updated: 2026-05-11

## Current state

- **Branch:** `sprint14-integrations-p2` — COMPLETE, pushed to origin
- **Tests:** 189/189 unit + 23/23 integration (gate PASS, 12 checks, 1 warning = pre-existing npm vulns)
- **Last commits on sprint14 branch:**
  - feat: add Google Drive and SharePoint adapters (T-110, T-110a)
  - feat: add Mailchimp and Constant Contact adapters (T-111, T-111a)
  - feat: add Google Forms adapter with survey import (T-112)
  - feat: add Eventbrite adapter with paginated attendee import (T-113)
  - feat: register all 6 Sprint 14 integration adapters in registry
  - feat: add integration UI touchpoints for attendees, surveys, and sync routes

## Sprint 14 — COMPLETE

All Sprint 14 tasks done. 9 integration providers total in registry.

## Next action: Sprint 15

**Brief:** `~/.claude/projects/-home-paul/memory/prezva_sprint_15_brief.md`

**Branch to create:** `sprint15-integrations-p3` from `sprint14-integrations-p2`

**Tasks:**
- T-114: WildApricot adapter (association verification)
- T-114a: iMIS adapter
- T-114b: MemberClicks adapter
- T-114c: YourMembership adapter
- T-114d: Glue Up adapter
- T-114e: Neon CRM adapter
- T-114f: Novi AMS adapter
- registry update + `verifyMembership` interface + `association-verify.ts` helper
- T-115: Integration management UI (sections, directionality config, Mailchimp list picker, reconnect)
- T-117: Member-only ticket gating (schema migration 0016, registration action check)

**After Sprint 15:** Write Sprint 16 brief (PWA + Expo wrapper, T-122 through T-140d).

## Key technical notes from Sprint 14

- `do..while` loops with ternary initializers trigger TS7022 "implicit any" — annotate with `const url: string`, `const res: Response`, `const data: Record<string, unknown>`
- Mailchimp: access_token is long-lived (no refresh). Stored in `encrypted_refresh_token` field. dc from `/oauth2/metadata` to `directionality_preferences.dc`
- Eventbrite: also long-lived access_token. Paginated via `continuation` token in `data.pagination`
- WildApricot (Sprint 15): uses Basic Auth in token exchange header, not body — handle inline in adapter
- Integration UI buttons are conditional on `status === 'connected'` — hidden when not OAuth'd

## Completed sprints
- Sprint 1: Schema reconciliation
- Sprint 2: Integration test gate
- Sprint 3: Existing feature delivery
- Sprint 4: UX polish + nav fixes
- Sprint 5: Registration depth
- Sprint 6: Agenda depth + session features
- Sprint 7: Check-in depth
- Sprint 8: Speakers + networking depth
- Sprint 9: Email + notifications
- Sprint 10: Survey depth
- Sprint 11: Productivity tools (CSV import, clone, templates, recurrence, badges)
- Sprint 12: Apple/Google Wallet passes
- Sprint 13: Integrations P1 (Outlook, Zoom, Teams + OAuth infrastructure)
- Sprint 14: Integrations P2 (Google Drive, SharePoint, Mailchimp, CC, Google Forms, Eventbrite)
