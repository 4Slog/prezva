Batch 6 — the FINAL nav-audit batch. Attendee-home polish: (a) emoji→lucide in ShareButtons, (b) de-dupe "Add to Calendar", (c) replace two full-mirror link strips with curated 3-card rows, + (d) fold in the deferred community-icon NC-8 fix. Display/layout only — zero data/permission/route logic changes.

Repo: /Users/wu/Prezva/dev (main, HEAD 272ac9b, clean tree). Attendee surface lives under src/app/e/[slug]/ (public routes, NOT the (dashboard) organizer routes).

=== CONTEXT (verified by recon, do not re-derive) ===
- src/app/e/[slug]/page.tsx (442 lines) is the attendee home. It branches by event state: POST-EVENT block (~line 222), REGISTERED block (has link strip at line 281 + "Add to Calendar" at line 302), PRE-EVENT hero block (has "Add to Calendar" at line 357, <ShareButtons> at line 359, link strip at line 376).
- src/components/events/ShareButtons.tsx renders: 🔗 Copy link, 𝕏 Share, "in Share", 📅 Add to Calendar — all emoji/text-as-icon. It receives calendarHref and renders its OWN Add to Calendar.
- src/components/attendee/AttendeeShell.tsx is the persistent attendee nav (tabs Home/Agenda/People/Community + a "More" sheet with MORE_ITEMS: Speakers, Sponsors, Photos, Trivia, Leaderboard, Passport, Icebreakers, Groups, Volunteer). The page link strips DUPLICATE these destinations = NC-1 mirror.
- AttendeeShell.tsx line 63: community tab uses MessageSquare. Organizer side (admin-tiles.ts:38, event-nav.ts:71,73) uses MessageCircle for the same "Community feed" concept.

=== PRE-WORK (read-only, report then STOP) ===
1. Open ShareButtons.tsx — confirm the 4 buttons and that calendarHref drives a "📅 Add to Calendar" <a>. Report the exact JSX of all 4.
2. Open page.tsx — confirm: line 357 hero "Add to Calendar" (href `/api/events/${slug}/calendar.ics`), line 359 <ShareButtons ... calendarHref={`/api/events/${slug}/calendar.ics`}/> (SAME endpoint = the duplicate). Confirm the registered-state "Add to Calendar" at line 302 uses a DIFFERENT endpoint (`/api/registrations/${reg.id}/calendar.ics`) — that one is NOT a duplicate, leave it.
3. Report the exact JSX of both link strips: line 281 (registered) and line 376 (pre-event), including their wrapping container styles.
4. Confirm AttendeeShell.tsx line 63 community icon = MessageSquare, and that MessageCircle is NOT yet imported in AttendeeShell (check the lucide import block ~lines 6-14). Report the import line.
5. Grep page.tsx for any OTHER <ShareButtons usage besides line 359 (expect only one).
STOP. Report all 5. Wait for "proceed".

=== TASKS (after approval) ===

(a) ShareButtons.tsx — emoji/text → lucide (NC-8):
- Import from lucide-react: Link2, Linkedin, CalendarPlus, Check (and keep whatever's needed). For the X/Twitter glyph use the lucide `Twitter` icon if present in the installed version; if `Twitter` is not exported, use a generic `Share2` icon rather than the 𝕏 character. (Check what the installed lucide-react exports before choosing.)
- Replace: "🔗 Copy link" → <Link2 size=14/> + "Copy link"; "✓ Copied!" → <Check size=14/> + "Copied!"; "𝕏 Share" → <Twitter/Share2 size=14/> + "Share"; "in Share" → <Linkedin size=14/> + "Share". Match the size/stroke pattern used in Batch 5 (size 14-16, inherit color, flex gap 6).

(b) De-dupe "Add to Calendar":
- ShareButtons is a SHARE component; calendar is a separate action. REMOVE the "📅 Add to Calendar" <a> from ShareButtons entirely. Remove the now-unused `calendarHref` prop from the ShareButtonsProps interface AND from the call site at page.tsx:359. (Confirm via PRE-WORK #5 there are no other callers; if there are, update them too.)
- The hero's dedicated "Add to Calendar" button at page.tsx:357 STAYS (it's the single canonical pre-event calendar action). The registered-state one at line 302 STAYS (different endpoint, different state).

(c) Replace the two full-mirror link strips with HARDCODED curated 3-card rows (NC-1 — no longer mirrors the More-sheet). These are intentional "explore" launchpad cards, not a nav mirror. Style them as small cards/buttons consistent with the existing surface (reuse the surrounding card/button styling already on the page; keep it visually a "row of 3").
- PRE-EVENT strip (line 376) → curated row of 3: Agenda (`/e/${slug}/agenda`), Speakers (`/e/${slug}/speakers`), Community (`/e/${slug}/community`).
- REGISTERED strip (line 281) → curated row of 3: My Agenda (`/e/${slug}/my-agenda`), My QR (`/e/${slug}/my-qr`), Community (`/e/${slug}/community`).
- Add a brief section label above each row ("Explore" or similar) so it reads as intentional, not a stray button cluster. Use plain non-technical language.
- IMPORTANT (leave a marker for the future feature): above each curated row, add a one-line code comment: `{/* TODO(featured-links): hardcoded defaults — replace with admin-curated featured links per event (pre/post). See prezva_deferred_backlog.md "Admin-customizable attendee home". */}`
- Do NOT touch the destinations themselves or the AttendeeShell. The dropped items remain reachable via the shell's More sheet — that's the point.

(d) Community-icon NC-8 fix:
- AttendeeShell.tsx line 63: change icon MessageSquare → MessageCircle. Update the lucide import (add MessageCircle; remove MessageSquare ONLY if nothing else in the file uses it — grep first).

=== GATES ===
- pnpm tsc --noEmit -> 0 (watch for unused-import errors from the ShareButtons emoji removal + calendarHref drop)
- pnpm test --run -> report count (expect 362)
- pnpm build -> clean
- pnpm lint -> clean
Do NOT commit. Report: git diff --stat, the final ShareButtons JSX, both curated-row JSX blocks, the calendarHref removal (interface + call site), and the AttendeeShell icon line. Confirm no other <ShareButtons caller broke.
