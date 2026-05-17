# Prezva Stress Test Plan

A reusable end-to-end stress test that simulates a real 500-person multi-day event with all the messy details organizers care about.

Run this in Claude Chrome (or manually) every time you finish a major bundle to catch regressions and gaps.

---

## Scenario: CivitasConnect 2026

A 3-day professional association conference. Use this as the consistent test fixture.

- **Org:** Civitas Foundation
- **Event:** CivitasConnect 2026
- **Dates:** June 15-17, 2026
- **Venue:** Atlanta Marriott Marquis (hybrid — in-person + virtual)
- **Attendees:** 500 (mix of in-person and virtual)
- **Tracks:** 3 parallel tracks per day (Policy, Practice, Research)
- **Sessions:** 36 total (12 per day) — 4 keynotes + 32 breakouts
- **Speakers:** 5 keynotes + 24 breakout speakers
- **Sponsors:** 8 (2 Platinum, 3 Gold, 3 Silver)
- **Volunteers:** 15
- **Tickets:** Early Bird ($199), General ($299), VIP ($499), Student ($49), Sponsor (comp)
- **Photo contest, certificates, surveys, networking** — all enabled

---

## Test Personas

Test the app from each of these perspectives. Each one finds different bugs.

| Persona | Email | Tests |
|---|---|---|
| Organizer (Paul) | sowu.paul@gmail.com | Setup, configuration, all admin flows |
| Attendee (general) | sarah.johnson@test.civitas.org | Register, pay, check-in, attend sessions |
| Attendee (VIP) | dr.michael.chen@test.civitas.org | VIP perks, separate registration flow |
| Speaker | keynote.speaker@test.civitas.org | Portal access, bio/photo upload, handouts |
| Volunteer | volunteer.bob@test.civitas.org | Limited admin access, check-in only |
| Walk-in | added at door | Day-of registration without prior signup |
| Refunder | refund.needed@test.civitas.org | Request refund, get refund |

---

## Part 1: Setup and Event Creation

### 1.1 Event Creation
- Create new org "Civitas Foundation" from /orgs/new
- Upload org logo (test the B6-4 upload — should be a file picker, not a URL field)
- Fill in org website, contact email, address (test B7-6)
- Complete Stripe Connect onboarding to charges_enabled = true
- Verify "13 requirements pending" error has been replaced with an actionable checklist (B9-3 gap)
- Create event "CivitasConnect 2026" from a template
- Upload event cover image (test B6-4 upload)
- Set timezone to America/New_York
- Set venue address + venue map upload
- PASS criteria: Event renders correctly at /e/civitasconnect-2026 with logo, cover, venue, and "Register" CTA

### 1.2 Tickets
- Create 4 ticket tiers (Early Bird with cutoff date, General, VIP, Student)
- Set capacity: Early Bird 100, General 300, VIP 50, Student 50
- Add a 10% off discount code with expiry
- Add a group rate (5+ tickets = 15% off)
- PASS criteria: All 4 tiers visible on public registration page with correct prices and remaining capacity

### 1.3 Agenda
- Create 3 tracks: Policy, Practice, Research
- Add 4 keynotes (one per morning, one closing)
- Add 32 breakout sessions across the 3 tracks
- Add capacity limits to small breakout rooms (30 seats each)
- Mark 2 keynotes as virtual-only with Zoom links (test B7-8 Zoom integration)
- Test conflict detection — does it warn if you put 2 keynotes at the same time?
- Export agenda to .ics — verify all sessions appear in calendar
- PASS criteria: Agenda renders by day on public page with track filtering working

### 1.4 Speakers
- Invite 5 keynote speakers by email
- Verify invite email arrives — branded, correct sender, correct name format
- Speaker accepts via portal link
- Speaker uploads photo (file upload not URL field — B6-4)
- Speaker uploads bio, links LinkedIn/Twitter
- Speaker uploads handouts (PDF + PPT — B6-3)
- Speaker assigned to 2 sessions (one keynote, one breakout)
- Speaker visible on public speakers page with photo, bio, sessions
- PASS criteria: All 5 speakers have complete profiles, no broken images, handouts downloadable

### 1.5 Sponsors
- Add 8 sponsors with logos, tiers, website links
- Test logo upload (B6-4)
- Verify sponsors render grouped by tier on public page
- PASS criteria: Platinum sponsors render larger than Silver, logos crisp, no broken images

---

## Part 2: Registration Flow (as Attendee)

### 2.1 Standard Registration
- Visit /e/civitasconnect-2026 in incognito (no auth)
- Click Register, select Early Bird ticket
- Fill form: First name "Sarah", Last name "Johnson", email
- CRITICAL NAME TEST: Verify form has separate first/last name fields, not just "Full name"
- Add custom field response: "Dietary restrictions: vegetarian"
- Enter Stripe test card 4242 4242 4242 4242
- Complete payment

Verify after registration:
- Confirmation page shows correct name ("Hi Sarah" not "Hi Sarah Johnson Johnson")
- QR code visible and scannable
- Apple Wallet button works (or hidden if not configured — B6-5)
- Google Wallet button works (or hidden if not configured — B6-5)
- "Add to Calendar" generates .ics with correct event details

Verify emails:
- Registration confirmation email arrives within 60 seconds
- Sender: noreply@prezva.app (or branded org domain)
- From name: "Civitas Foundation" (org name, not "Prezva")
- Greeting: "Hi Sarah" (first name only, not "Hi Sarah Johnson")
- Content: Event title, date, venue, QR code, "View event page" link
- Footer: Civitas branding + "Sent via Prezva" attribution
- No spam folder (check Gmail spam, not just inbox)
- Stripe receipt arrives separately

### 2.2 VIP Registration
Same flow but with VIP ticket. Verify:
- VIP-specific confirmation language
- VIP perks listed (e.g. "Access to VIP reception")

### 2.3 Group Registration
- Register 5 tickets at once with different attendee names
- Verify each attendee gets their own confirmation email with their own QR code
- Verify primary purchaser gets a master receipt

### 2.4 Failed Payment
- Try Stripe declined card 4000 0000 0000 0002
- Verify clear error message, no half-created registration
- Try again with valid card, succeeds cleanly

---

## Part 3: Pre-Event Communications

### 3.1 Announcements
- As organizer, send announcement to all attendees
- Verify announcement arrives via email + push
- Greeting test: "Hi Sarah," not "Hi Sarah Johnson," or "Hi {first_name}"
- Test scheduled announcement — set to send in 10 minutes, verify cron picks it up (Bundle 5)
- Test audience targeting — send to "VIP only" — verify only VIPs receive it

### 3.2 Reminders
- Trigger 7-day reminder manually
- Trigger 1-day reminder
- Verify both arrive with correct content

### 3.3 Speaker Communications
- As organizer, send pre-event prep email to all speakers
- Verify speakers receive their portal link in the email
- Click portal link in incognito — verify direct access without password (token-based)

---

## Part 4: Print Quality — Badges (CRITICAL)

This is where most event platforms fail. Test ruthlessly.

### 4.1 Badge Template
- Open badge template editor
- Standard badge size: Should default to 4" x 3" landscape (Avery 5392) OR 3.5" x 5" portrait (Avery 5384) — both are industry standard
- Verify the editor shows actual dimensions, not just relative scale
- Upload org logo to badge (B6-4 upload)
- Use a brand color from org settings — verify the badge picker pulls from org branding

### 4.2 Badge Print Output
- Print all badges (PDF)
- Open PDF in browser

CRITICAL CHECKS:
- Page size: US Letter (8.5x11) — not A4
- Badge dimensions: exactly the size set in editor (use a ruler in PDF viewer)
- One badge per page? Or 4-up Avery format? Should support BOTH
- No bleeding: text not cut off at edges
- QR code: minimum 0.75" x 0.75" — scannable from 6 inches away
- First name large, last name smaller
- Org logo appears with no distortion
- Company name visible
- Title visible
- Track or ticket type indicator (Speaker/VIP/Attendee — color-coded)

### 4.3 Print Test
- Actually print 5 badges on Avery 5392 cardstock — verify alignment
- Verify badges fit in standard 4" x 3" lanyards/sleeves
- Test reprint: change attendee name, reprint single badge — verify only that one prints

### 4.4 Adobe / PDF Library Question
Current state: Prezva generates PDFs server-side with pdf-lib or similar. No Adobe extension needed for basic badges.

When you might need Adobe: Only if you want to support .ai or .psd template imports. For now, browser-based template editor + server-side PDF gen is the right architecture.

Recommendation: Add a "Test print" feature that prints ONE badge with placeholder data so organizers can verify alignment before printing 500.

---

## Part 5: Print Quality — Icebreakers, Certificates, QR Codes

### 5.1 Icebreaker Cards
- Generate icebreaker print sheet
- Decision needed: Are these intended to be:
  - Index cards (3"x5") for handing out one-per-attendee?
  - Conversation prompts on lanyards?
  - Table tents?
- Verify print output is usable physically
- Canva integration opportunity: Allow organizers to design icebreaker cards in Canva and import — would be a huge selling point vs Whova

### 5.2 Certificates
- Configure certificate template with org logo, brand color, signature
- Issue test certificate to test attendee
- Download PDF

CRITICAL CHECKS:
- Page size: 8.5x11 portrait (or 11x8.5 landscape)
- High quality: 300 DPI minimum, logos sharp
- Attendee name centered, correctly formatted ("Sarah Johnson" not "sarah johnson")
- Event title, date
- Org name + logo
- Signature image (uploaded by org)
- Unique certificate ID + verification URL
- No "Generated by Prezva" watermark unless on free tier

### 5.3 QR Codes
- Test 10 different QR codes scanned with phone
- Pass criteria: All 10 scan successfully from at least 6" away
- Verify high contrast (black on white, not gray on gray)
- Verify error correction level H (handles 30% damage)

---

## Part 6: Day-of Operations (as Volunteer / Check-in Staff)

### 6.1 Check-in Kiosk
- Open /events/civitasconnect-2026/checkin on iPad
- Test QR scan with phone — verify camera permission works
- Test name search "Sarah" — verify autocomplete shows Sarah Johnson
- Check in Sarah
- Print her badge immediately from check-in screen
- PASS criteria: Full check-in including badge print takes under 15 seconds

### 6.2 Walk-in Registration
- Click "Walk-in" — register a new attendee on the spot
- Enter name, email, ticket type
- Charge their card or mark as pay-later
- Generate badge on the fly
- PASS criteria: Walk-in to badge in hand under 60 seconds

### 6.3 Session-level Check-in
- At session start, scan attendees into specific session (B7-1)
- Verify attendance counted toward certificate eligibility (80% threshold)
- Verify CE credit hours awarded if session has them configured

### 6.4 Volunteer Limitations
- Log in as volunteer.bob@test.civitas.org
- PASS criteria: Can see check-in page, CANT see Stripe revenue, CANT delete attendees, CANT send announcements

---

## Part 7: Live Engagement Features

### 7.1 Photo Contest
- As attendee, upload photo from phone camera (B6-2)
- Verify upload works (no "Bucket not found" error)
- Add caption
- Verify photo appears in gallery within 30 seconds
- Vote on other photos
- As organizer, mark winner
- PASS criteria: Upload-to-display under 30s, voting prevents duplicates

### 7.2 Community Feed
- Post text + image (B6-8 upload)
- Like, comment
- Report a post — verify modal not browser prompt (B8-6)
- As organizer, moderate reported post

### 7.3 Networking
- Opt into networking, upload avatar (B6-6 file upload)
- Browse directory, find another attendee by interest
- Send connection request
- GAP: Currently no connection requests — this needs Bundle 9 B9-5

### 7.4 Live Polls / Trivia
- Run trivia round during a session
- Verify leaderboard updates in real-time
- Verify points award correctly

### 7.5 Push Notifications
- Send announcement with push enabled
- PASS criteria: Push arrives on iPhone within 30s, taps to open relevant page

---

## Part 8: Post-Event

### 8.1 Certificates
- Verify attendees with at least 80% session attendance receive certificate email
- Download own certificate from confirmation page
- Verify certificate ID is verifiable at /verify/[id]

### 8.2 Surveys
- Send post-event survey to all attendees
- Complete survey as 3 different attendees
- As organizer, view aggregated results
- Export to CSV
- PASS criteria: Response rate visible, individual responses, aggregate stats

### 8.3 Refunds
- Process refund for refund.needed@test.civitas.org
- Verify Stripe refund initiated (test mode)
- Verify attendee receives refund confirmation email
- Verify registration marked as cancelled, badge invalidated

### 8.4 Analytics
- View final dashboard
- Verify accuracy:
  - Total registrations matches sum of ticket sales
  - Revenue matches Stripe dashboard within $1
  - Check-in rate calculated correctly
  - Session attendance numbers match actual scans

---

## Part 9: Email Deliverability Audit

Every transactional email matters. Test all of these.

| Email | Triggered By | Pass Criteria |
|---|---|---|
| Registration confirmation | Completing registration | Arrives under 60s, correct branding, correct name format |
| Payment receipt | Stripe charge succeeded | Arrives under 2 min, separate from confirmation |
| Pre-event reminder (7d) | Cron job | Sent on day -7 at 9am attendee timezone |
| Pre-event reminder (1d) | Cron job | Sent on day -1 at 9am |
| Day-of welcome | Event start morning | Sent at 7am attendee timezone |
| Speaker invite | Organizer sends | Token link works, no password needed |
| Volunteer invite | Organizer sends | Sets up limited admin access |
| Announcement | Organizer sends | All recipients receive within 5 min |
| Scheduled announcement | Cron + Trigger.dev | Fires at exactly scheduled time |
| Certificate issued | After event + eligibility check | Includes PDF link |
| Survey link | Organizer sends | Survey opens, response captured |
| Refund issued | Stripe refund webhook | Confirms refund + timing |
| Password reset | Forgot password flow | Reset link works, expires in 1h |

For each email, verify:
- Arrives in inbox (not spam) — test on Gmail, Outlook, Yahoo, iCloud
- From name = Org name, not "Prezva"
- From email = noreply@prezva.app (or custom domain if configured)
- Greeting uses first name only ("Hi Sarah" not "Hi Sarah Johnson")
- No "Hi undefined" or "Hi null"
- Org logo loads
- All links work and use HTTPS
- Unsubscribe link present and functional
- Mobile-responsive on iPhone Mail and Gmail app
- Plain text fallback exists

---

## Part 10: Integration Verification (after B7-8)

For each integration, verify the full round-trip works:

### 10.1 Zoom
- Connect Zoom in org integrations
- Create Zoom meeting from session edit form (B7-8 Part A)
- Verify meeting created in Zoom dashboard with correct title, time, duration
- Verify session displays Zoom join URL on event page

### 10.2 Teams
- Same flow with Microsoft Teams

### 10.3 Outlook Calendar
- "Add to Outlook" button on event settings (B7-8 Part C)
- Verify calendar invite arrives in Outlook with correct details

### 10.4 Google Drive
- Pick a Google Drive file to attach to event (B7-8 Part E)
- Verify file appears as resource on event page

### 10.5 SharePoint
- Same flow with SharePoint (B7-8 Part F)

### 10.6 Google Forms
- Paste a Google Form URL (B7-8 Part D)
- Verify form ID extracted automatically
- Verify responses sync to Prezva surveys

### 10.7 Mailchimp
- Connect Mailchimp
- Select list from dropdown (B7-8 Part G — not text input)
- Register an attendee — verify they appear in Mailchimp list within 60s

### 10.8 Eventbrite Import
- Connect Eventbrite
- Select event from dropdown (B7-8 Part H)
- Verify attendees imported

---

## Part 11: Multi-Tenant Isolation (CRITICAL SECURITY)

- Create second org "Acme Corp" with separate event
- Log in as Civitas Foundation member
- PASS criteria: Cannot see Acme Corp data anywhere
- Try to access /orgs/acme-corp/settings directly — should 404 or "Not authorized"
- Try to access /events/acme-event/attendees directly — should fail
- Acid test: Use the same browser session, copy a UUID from Civitas event, paste into Acme event URL — must fail

---

## Part 12: Mobile Experience

Test on real iPhone (Safari + Chrome) and Android (Chrome).

- Public event page renders correctly mobile
- Registration flow works on mobile (form fields visible, payment works)
- QR code scanner works from phone camera
- Check-in flow usable on tablet
- Photo upload from phone works (B6-2)
- PWA install prompt appears
- Add to home screen creates icon
- Push notifications work after PWA install

---

## Part 13: Whova / Eventbrite Parity Check

What competitors have that we need (gap analysis):

| Feature | Whova | Eventbrite | Prezva | Priority |
|---|---|---|---|---|
| Community feed | Yes | No | Yes | Done |
| Direct messaging | Yes | No | Yes | Done |
| Photo wall | Yes | No | Yes | Done |
| Speed networking | Yes | No | No | Bundle 9 |
| Lead retrieval for sponsors | Yes | No | No | Bundle 9 |
| Multi-language | Yes | Yes | No | Bundle 10+ |
| Native mobile app | Yes | Yes | PWA only | Long-term |
| Live polls in sessions | Yes | No | Partial (trivia) | Bundle 9 |
| Live Q&A | Yes | No | No | Bundle 9 |
| Session feedback | Yes | No | Via surveys | OK |
| Exhibitor virtual booths | Yes | No | No | Bundle 10+ |
| Promo codes | Limited | Yes | Partial | Bundle 7 |
| Affiliate tracking | No | Yes | No | Bundle 10+ |
| Waitlist | Yes | Yes | No | Bundle 9 |
| Reserved seating | No | Yes | No | Bundle 10+ |
| Event discovery marketplace | Yes | Yes | No | Long-term |
| Canva integration for badges/cert design | No | No | No | DIFFERENTIATOR |
| Org branding on every PDF | Limited | Limited | Yes | DIFFERENTIATOR |
| Multi-event passport / cross-event certs | No | No | Yes | DIFFERENTIATOR |
| Open API + webhooks | Limited | Yes | Partial | Bundle 10+ |

### Differentiator opportunities (your competitive moat)

1. **Canva integration** — Let organizers design badges, certificates, and social posts in Canva, then import as Prezva templates. Whova doesn't have this. Could be a one-click "Open in Canva" button using their Connect Apps SDK.

2. **AI announcements** — Use the embedded Claude API to draft event announcements, speaker bios, marketing emails. Whova has nothing like this.

3. **Cross-event member loyalty** — The passport feature already in Bundle 7 is unique. Push this hard in marketing.

4. **White-label PDFs** — On paid plans, no "Powered by Prezva" watermarks anywhere. Whova brands every email and certificate.

5. **Stripe Connect with org-level payments** — Money goes directly to organizers, not through Prezva. Most competitors take 5-10% per ticket. This is huge for associations.

---

## Part 14: Performance Under Load

Run only on staging, never production.

- Simulate 500 concurrent users hitting /e/civitasconnect-2026 — page load under 3s p95
- Simulate 50 concurrent registrations — all complete within 60s
- Photo gallery with 1000 photos — initial load under 5s, infinite scroll smooth
- Check-in scanner with 500 records — name search responds under 200ms

---

## Part 15: Accessibility (WCAG 2.1 AA)

- Run axe DevTools on every public page — zero critical issues
- Tab through registration flow with keyboard only — all interactive elements reachable
- Screen reader (VoiceOver Mac) reads all form labels correctly
- Contrast ratio: minimum 4.5:1 for body text, 3:1 for large text
- All images have alt text
- Color is never the only indicator (status uses icon + color + label)

---

## Scorecard

After running, fill this out:

| Section | Score (0-10) | Critical Issues | Notes |
|---|---|---|---|
| 1. Setup and creation | / 10 | | |
| 2. Registration flow | / 10 | | |
| 3. Pre-event comms | / 10 | | |
| 4. Badge printing | / 10 | | |
| 5. Other print quality | / 10 | | |
| 6. Day-of operations | / 10 | | |
| 7. Live engagement | / 10 | | |
| 8. Post-event | / 10 | | |
| 9. Email deliverability | / 10 | | |
| 10. Integrations | / 10 | | |
| 11. Multi-tenant isolation | / 10 | | |
| 12. Mobile | / 10 | | |
| 13. Competitive parity | / 10 | | |
| 14. Performance | / 10 | | |
| 15. Accessibility | / 10 | | |
| TOTAL | / 150 | | |

Target: 130+/150 before public launch.

---

## How to Run This

### With Claude Chrome

Open Claude Chrome and tell it:

```
Read the stress test plan I have at this URL: https://github.com/4Slog/prezva/blob/main/docs/stress-test-plan.md
Execute Part 1 and Part 2 against staging.prezva.app.
Use the test attendees in the Personas section.
Report back: which checkboxes pass, which fail, with screenshots of failures.
```

Run one section at a time — the full plan is approximately 3 hours end-to-end.

### Manually

Print the relevant section, sit with a coffee, work through it. Best done with two devices side by side (laptop = organizer, phone = attendee).

### Frequency

- After every bundle merge: re-run the section relevant to what changed
- Monthly: full Part 1-9 (3 hours)
- Quarterly: full plan (8 hours)
- Before any major release or big event: full plan + load test
