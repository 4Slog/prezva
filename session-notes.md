# Prezva Session Notes

## Last updated: 2026-05-11

## Current state

- **Branch:** `sprint15-integrations-p3` — COMPLETE, pushed to origin
- **Tests:** 189/189 unit + 23/23 integration (gate PASS, 12 checks, 1 warning = pre-existing npm vulns)
- **Integration providers:** 16 total (was 9 after S14, now +7 association adapters)

## Sprint 15 — COMPLETE

All Sprint 15 tasks done:
- T-114 through T-114f: 7 association adapters (WildApricot, iMIS, MemberClicks, YourMembership, Glue Up, Neon, Novi)
- verifyMembership interface + association-verify helper
- T-117: member-only ticket gating (migration 0016, registration check, TicketManager checkbox)
- T-115: integration management UI (7 sections, Mailchimp list picker, disconnect API, last-synced timestamps, association badges)

## Next action: Sprint 16

**Brief:** `~/.claude/projects/-home-paul/memory/prezva_sprint_16_brief.md`

**Branch to create:** `sprint16-pwa-expo` from `sprint15-integrations-p3`

**Tasks:**
- T-122: Wire SyncHealthPill to navigator.onLine + Dexie pending count
- T-123: next-pwa + service worker (Workbox)
- T-123a: Web app manifest + icons (192px, 512px) + metadata
- T-123b: iOS "Add to Home Screen" prompt component
- T-123c: Workbox cache strategies (StaleWhileRevalidate agenda, NetworkFirst checkin)
- T-124: Web Push VAPID (generate keys, subscribe endpoint, push_subscriptions table migration 0017, send on announcement)
- T-125: audit_logs table migration 0018 + writes in org/event/attendee actions
- T-125a: OfflineIndicator component in root layout
- T-140: Create Expo webview wrapper at ~/Prezva/expo/ (blank-typescript template)
- T-140a: Native push bridge (expo-notifications, token injection to WebView)
- T-140b: EAS Build pipeline (eas.json, Paul-dependent on Apple/Play enrollment)
- T-140c/d: App Store/Play Store submission prep docs (deferred — Paul enrollment needed)

**Key note:** T-140c (iOS App Store) and T-140d (Google Play) are Paul-dependent. Write the config and prep docs but mark as deferred pending Apple Developer enrollment.

## Key technical notes from Sprint 15

- WildApricot: Basic Auth header for token exchange (not body params) — inline in adapter
- Novi: fully inline token flow — org-specific subdomain from NOVI_SUBDOMAIN env var
- iMIS/MemberClicks: store org-specific base URLs in directionality_preferences
- T-117: `(ticket as any).membership_required` — verifyMembership is a no-op when no association provider connected
- New POST endpoint `/api/integrations/[provider]/disconnect` replaces server action in page

## Completed sprints
- S1: Schema reconciliation | S2: Integration test gate | S3: Feature delivery
- S4: UX polish | S5: Registration depth | S6: Agenda depth
- S7: Check-in depth | S8: Speakers + networking | S9: Email + notifications
- S10: Survey depth | S11: Productivity tools | S12: Apple/Google Wallet
- S13: Integrations P1 (Outlook, Zoom, Teams) | S14: Integrations P2 (Drive, SP, Mailchimp, CC, GForms, EB)
- S15: Integrations P3 (7 association adapters + mgmt UI + member gating)
