# Prezva Test Plan

A structured, executable test plan with exact inputs, expected outputs, and pass/fail criteria. Pairs with `stress-test-plan.md` (UX-focused, full event simulation) and `code-audit-plan.md` (static analysis).

This document is the *integration test bible* — every flow that matters, every edge case, with concrete data.

---

## How to run

Three modes:

1. **Manual (full)** — sit down with two devices, work through each section. ~6 hours full pass.
2. **Manual (smoke)** — run the SMOKE-tagged tests only. ~30 minutes.
3. **Claude Chrome automated** — paste a section into Claude Chrome and have it execute the tests in a real browser, reporting pass/fail per test.

Test environment: https://prezva.app (production) or staging.prezva.app (preferred for destructive tests).

---

## Test data fixtures

Use the same fixtures every time for comparable results.

### Stripe test cards
- Success: `4242 4242 4242 4242`
- Declined: `4000 0000 0000 0002`
- Insufficient funds: `4000 0000 0000 9995`
- Authentication required (3DS): `4000 0027 6000 3184`
- Disputed: `4000 0000 0000 0259`

CVC: any 3 digits. Expiry: any future date. ZIP: any 5 digits.

### Test users (create once, reuse)
| Email | Password | Role | Notes |
|---|---|---|---|
| owner@test.prezva.app | TestPass123! | Org owner | Full admin |
| admin@test.prezva.app | TestPass123! | Org admin | Full admin |
| staff@test.prezva.app | TestPass123! | Org staff | Limited admin |
| attendee@test.prezva.app | TestPass123! | Attendee | Public user |
| speaker@test.prezva.app | TestPass123! | Speaker | Speaker portal |
| other-org-owner@test.prezva.app | TestPass123! | Other org owner | Multi-tenant tests |

### Test event
Use the CivitasConnect 2026 fixture from `stress-test-plan.md` for consistency across documents.

---

## SMOKE — 30-minute smoke test

Tag: `[SMOKE]`. Run after every deploy to catch regressions fast. ~30 minutes.

Each smoke test is also tagged with the larger section it belongs to.

---

## Section 1: Auth & onboarding

### TEST 1.1 [SMOKE] Sign up with invite code
- **Preconditions:** Have an unused invite code (e.g. `PREZVA-BETA-001`)
- **Steps:**
  1. Visit `/signup` in incognito
  2. Enter email `test-new@example.com`, password `TestPass123!`, invite code from above
  3. Submit
- **Expected:**
  - Email verification email arrives within 60s
  - After verifying, redirected to `/orgs/new` or `/dashboard`
  - Invite code marked as used (cannot be reused)
- **Pass:** All three above.
- **Fail criteria:** Code allowed reuse, no email, no redirect.

### TEST 1.2 Sign up without invite code
- **Steps:** Same as 1.1 but skip invite code field
- **Expected:** Form blocks submission with "Invite code required"
- **Pass:** Submission blocked.

### TEST 1.3 [SMOKE] Sign in with email/password
- **Preconditions:** User `owner@test.prezva.app` exists
- **Steps:** Visit `/login`, enter credentials, submit
- **Expected:** Redirected to `/dashboard`, session cookie set
- **Pass:** Lands on dashboard.

### TEST 1.4 Password reset
- **Steps:**
  1. Visit `/login`, click "Forgot password"
  2. Enter `owner@test.prezva.app`
  3. Check email, click reset link
  4. Enter new password
- **Expected:** Reset email arrives < 60s, link works, new password accepted, can log in with new password
- **Pass:** Full flow completes.

### TEST 1.5 [SMOKE] Sign out
- **Steps:** Click avatar → Sign out
- **Expected:** Redirected to `/`, session cleared, accessing `/dashboard` requires re-login
- **Pass:** Cannot access protected routes after.

### TEST 1.6 OAuth sign-in (Google) — if enabled
- **Steps:** Visit `/login`, click "Continue with Google", complete OAuth
- **Expected:** Account created or signed in, profile pre-filled with name + avatar from Google
- **Pass:** Profile fields populated. (Note: invite code may still be required after OAuth.)

### TEST 1.7 MFA enrollment
- **Steps:** Settings → Security → Enable MFA, scan QR with authenticator app, enter 6-digit code
- **Expected:** MFA enabled, subsequent logins require 6-digit code
- **Pass:** Logout, log back in, code required.

---

## Section 2: Organizations

### TEST 2.1 [SMOKE] Create new organization
- **Preconditions:** Logged in as `owner@test.prezva.app`
- **Steps:** Click "Create org", enter "Test Org Alpha", submit
- **Expected:** Redirected to `/orgs/test-org-alpha/settings`, user is owner
- **Pass:** Org appears in org switcher, can navigate to it.

### TEST 2.2 Invite team member
- **Steps:** Org settings → Team → Invite, enter `staff@test.prezva.app`, role: admin, submit
- **Expected:** Invite email arrives at staff@, with accept link, valid for 7 days
- **Pass:** Staff member can accept and is added to the org with admin role.

### TEST 2.3 Switch between orgs
- **Preconditions:** User is in 2+ orgs
- **Steps:** Click org switcher in header, select other org
- **Expected:** All data switches to the selected org's scope, URL updates
- **Pass:** Events list, members list etc. all change.

### TEST 2.4 Role permissions — staff cannot delete events
- **Steps:** Log in as staff, navigate to an event, look for "Delete event"
- **Expected:** Delete option is hidden or returns 403 if accessed directly
- **Pass:** Cannot delete.

### TEST 2.5 Role permissions — staff cannot see Stripe revenue
- **Steps:** Log in as staff, navigate to org settings
- **Expected:** Stripe Connect section is hidden or shows "Owner only"
- **Pass:** Revenue numbers not visible.

---

## Section 3: Event creation

### TEST 3.1 [SMOKE] Create event from template
- **Preconditions:** Logged in as org admin/owner
- **Steps:**
  1. Click "Create event" → select "Conference" template
  2. Enter title "Test Event 2026", slug auto-fills, date Aug 1 2026
  3. Submit
- **Expected:** Redirected to event admin page, event has default agenda/tickets/etc from template
- **Pass:** Event appears in events list, template data loaded.

### TEST 3.2 Slug uniqueness
- **Steps:** Create event with title same as existing → check slug
- **Expected:** Slug gets a numeric suffix (e.g. `test-event-2026-2`)
- **Pass:** No collision.

### TEST 3.3 Cover image upload
- **Steps:** Event settings → Branding → upload a 3MB JPEG
- **Expected:** Image uploads, preview shows, public page renders the image
- **Pass:** Image visible on `/e/<slug>`.

### TEST 3.4 Cover image rejected — too large
- **Steps:** Try to upload a 10MB image
- **Expected:** Client-side rejection with "File too large (max 5MB)"
- **Pass:** No upload attempted.

### TEST 3.5 Cover image rejected — wrong type
- **Steps:** Try to upload a `.pdf` as cover image
- **Expected:** Rejected with "File type application/pdf not allowed"
- **Pass:** Upload blocked.

### TEST 3.6 Publish event
- **Steps:** Event settings → Status → Publish
- **Expected:** Public URL `/e/<slug>` works without auth, status badge changes to Published
- **Pass:** Anon user can view event.

### TEST 3.7 Cancel event
- **Steps:** Settings → Status → Cancel, confirm dialog
- **Expected:** Status = cancelled, public page shows "This event was cancelled", attendees receive cancellation email
- **Pass:** All three.

---

## Section 4: Tickets

### TEST 4.1 [SMOKE] Create free ticket
- **Steps:** Tickets → Create, type: Free, name: "General Admission", quantity: 100
- **Expected:** Ticket appears in list, public registration shows it as "$0"
- **Pass:** Visible to public.

### TEST 4.2 Create paid ticket
- **Steps:** Type: Paid, price: $99, currency: USD, quantity: 50
- **Expected:** Ticket shows "$99.00" on public page, Stripe checkout would charge $99
- **Pass:** Stripe test purchase succeeds.

### TEST 4.3 Sold-out ticket
- **Steps:** Set quantity to 1, register 1 attendee, try to register another
- **Expected:** Ticket shows "Sold out", registration form blocks selection
- **Pass:** Cannot register a 2nd attendee.

### TEST 4.4 Hidden ticket
- **Steps:** Set `is_visible: false`, view public page
- **Expected:** Ticket does not appear in dropdown
- **Pass:** Hidden from public.

### TEST 4.5 Sale start date enforcement
- **Steps:** Set sale_starts_at to tomorrow, try to register today
- **Expected:** Ticket is unavailable with "Sales start [date]"
- **Pass:** Cannot register before start.

### TEST 4.6 Sale end date enforcement
- **Steps:** Set sale_ends_at to yesterday, try to register today
- **Expected:** "Sales ended"
- **Pass:** Cannot register after end.

### TEST 4.7 Discount code — percent
- **Preconditions:** Bundle 9 deployed, discount code admin UI exists
- **Steps:** Create code `TESTPCT` 10% off, then register and apply code
- **Expected:** Order total reduced by 10%, code uses_count = 1
- **Pass:** Discount applied, count incremented.

### TEST 4.8 Discount code — fixed amount
- **Steps:** Create code `TESTFIX` $20 off, apply to a $50 ticket
- **Expected:** Order total = $30
- **Pass:** Correct amount.

### TEST 4.9 Discount code — invalid
- **Steps:** Try to apply `DOESNOTEXIST`
- **Expected:** "Invalid discount code"
- **Pass:** No discount applied.

### TEST 4.10 Discount code — expired
- **Steps:** Create code with `valid_until` in past, try to apply
- **Expected:** "Discount code expired"
- **Pass:** Blocked.

### TEST 4.11 Discount code — max uses reached
- **Steps:** Code with max_uses = 1, use it, try to use again
- **Expected:** "Discount code limit reached"
- **Pass:** Second use blocked.

---

## Section 5: Registration

### TEST 5.1 [SMOKE] Register for free event
- **Steps:** Visit public event page in incognito, click Register, fill form with `attendee@test.prezva.app`, submit
- **Expected:**
  - Confirmation page shows QR code
  - Confirmation email arrives within 60s
  - Email sender = org name (not "Prezva")
  - Email greeting = "Hi <FirstName>" (first name only)
  - Email contains event date, venue, QR
- **Pass:** All 5 conditions.

### TEST 5.2 [SMOKE] Register for paid event (success)
- **Steps:** Select paid ticket, fill form, Stripe card `4242 4242 4242 4242`, submit
- **Expected:**
  - Redirected to confirmation page
  - Confirmation email arrives
  - Stripe receipt arrives separately
  - Registration status = "confirmed"
  - Stripe dashboard shows the charge
- **Pass:** All conditions.

### TEST 5.3 [SMOKE] Register for paid event (declined card)
- **Steps:** Same as 5.2 with card `4000 0000 0000 0002`
- **Expected:** Clear error "Card declined", no registration created, no charge attempted again
- **Pass:** No phantom registration, clear error.

### TEST 5.4 Register with insufficient funds
- **Steps:** Card `4000 0000 0000 9995`
- **Expected:** "Insufficient funds" error
- **Pass:** Specific error message.

### TEST 5.5 Register with 3DS authentication
- **Steps:** Card `4000 0027 6000 3184`
- **Expected:** Stripe 3DS challenge modal appears, after passing it the registration completes
- **Pass:** Challenge then success.

### TEST 5.6 Group registration (5 tickets)
- **Steps:** Select quantity: 5, fill 5 sets of attendee info, pay
- **Expected:**
  - Primary purchaser charged for 5 tickets
  - Each of the 5 attendees gets their own confirmation email with their own QR
  - Primary gets a master receipt listing all 5
- **Pass:** 5 separate emails, 1 master receipt.

### TEST 5.7 Registration with custom field (Bundle 9)
- **Preconditions:** Bundle 9 deployed, event has a custom field "Dietary restrictions"
- **Steps:** Register, fill custom field
- **Expected:** Response stored in `form_responses` table, visible to organizer in attendee detail view
- **Pass:** Organizer can see the response.

### TEST 5.8 Custom field required validation
- **Steps:** Custom field marked required, submit form blank
- **Expected:** Form blocks submission with field-specific error
- **Pass:** Validation works.

### TEST 5.9 Waitlist registration when sold out
- **Steps:** Sell out the only ticket, try to register
- **Expected:** "Join waitlist" button instead of "Register". Submit, waitlist confirmation email.
- **Pass:** Confirmation says "You're on the waitlist."

### TEST 5.10 Waitlist promotion
- **Steps:** Cancel a confirmed registration, wait for cron (5 min) or trigger manually
- **Expected:** First waitlisted person promoted to confirmed, receives promotion email with QR
- **Pass:** Status flip from waitlisted to confirmed, email arrives.

---

## Section 6: Check-in

### TEST 6.1 [SMOKE] QR code check-in
- **Preconditions:** Registered test attendee with QR code from email
- **Steps:** Open `/events/<slug>/checkin` on iPad, scan QR with phone (or paste QR data)
- **Expected:** "Welcome <Name>" confirmation, attendee status = "checked_in", checked_in_at timestamp set
- **Pass:** Status updates within 2 seconds.

### TEST 6.2 [SMOKE] Name search check-in
- **Steps:** Type partial name in search field
- **Expected:** Autocomplete shows matches, click to check in
- **Pass:** Same outcome as 6.1.

### TEST 6.3 Double check-in prevention
- **Steps:** Check in same attendee twice
- **Expected:** Second attempt shows "Already checked in at <time>" — no status change, no error
- **Pass:** Idempotent.

### TEST 6.4 Walk-in registration at door
- **Steps:** Click "Walk-in", enter name/email, select ticket, charge card (or mark comp), submit
- **Expected:** Registration created with status = checked_in, payment processed if paid
- **Pass:** Attendee appears in attendees list immediately.

### TEST 6.5 Print badge from check-in
- **Steps:** After check-in, click "Print badge"
- **Expected:** PDF opens with single badge, attendee name, QR, ready to print
- **Pass:** PDF generates within 5s.

### TEST 6.6 Session-level check-in (Bundle 7 / B7-1)
- **Preconditions:** Session check-in built
- **Steps:** Open session check-in scanner, scan attendee
- **Expected:** Session attendance recorded, counts toward certificate eligibility
- **Pass:** Attendance shown in session details.

### TEST 6.7 Kiosk mode (Bundle 9 / B9-12)
- **Preconditions:** Bundle 9 deployed
- **Steps:** Click "Enter kiosk mode" on checkin page
- **Expected:** All nav/chrome hidden, fullscreen scanner, after check-in resets to scanner within 30s
- **Pass:** Press Escape 3 times to exit.

---

## Section 7: Speakers (post-Bundle 9)

### TEST 7.1 [SMOKE] Create speaker from Speakers page
- **Steps:** Speakers page → Add speaker, fill name/email/bio, save
- **Expected:** Speaker appears in list, status = "pending invite"
- **Pass:** Speaker visible.

### TEST 7.2 Send speaker invite
- **Steps:** Click Invite on a speaker row
- **Expected:** Invite email arrives at speaker email with portal link, status changes to "invited"
- **Pass:** Email arrives within 60s.

### TEST 7.3 Speaker accepts invite
- **Steps:** Open speaker portal link in incognito (no login)
- **Expected:** Speaker portal renders without password, shows their profile form
- **Pass:** Direct token-based access works.

### TEST 7.4 Speaker uploads photo
- **Steps:** In speaker portal, upload a photo (B6-4 upload)
- **Expected:** Photo uploads, appears in profile, appears on public event speakers page
- **Pass:** Image visible publicly.

### TEST 7.5 Speaker uploads handout PDF
- **Steps:** In speaker portal, upload a 5MB PDF
- **Expected:** Upload succeeds, file in `speaker-handouts` bucket
- **Pass:** Attendees can download the handout post-event.

### TEST 7.6 Speaker rejected — wrong file type
- **Steps:** Try to upload a `.exe` as handout
- **Expected:** Rejected with "Only PDF, Word, and PowerPoint files allowed"
- **Pass:** Upload blocked.

### TEST 7.7 Assign speaker to session
- **Steps:** Edit a session, multi-select speakers, save
- **Expected:** Session detail shows speakers, public agenda shows speaker names + photos
- **Pass:** Speakers visible on public agenda.

---

## Section 8: Agenda

### TEST 8.1 [SMOKE] Create session
- **Steps:** Agenda → Add session, fill title/date/time/duration, save
- **Expected:** Session appears in agenda
- **Pass:** Visible.

### TEST 8.2 Create track
- **Steps:** Agenda → Manage tracks → Add track "Engineering", color blue
- **Expected:** Track appears, can be selected when creating sessions
- **Pass:** Visible in dropdown.

### TEST 8.3 Create room (Bundle 9 / B9-1)
- **Steps:** Agenda → Manage rooms → Add room "Ballroom A", capacity 200
- **Expected:** Room appears, can be selected when creating sessions
- **Pass:** Visible in dropdown.

### TEST 8.4 Session conflict warning
- **Steps:** Create two sessions in the same room at overlapping times
- **Expected:** Warning shown when saving the second: "This room is already booked at this time"
- **Pass:** Warning appears (not blocking, just informative).

### TEST 8.5 Session capacity limit (Bundle 9)
- **Steps:** Set session capacity to 30, register 30 attendees to it, try to register a 31st
- **Expected:** 31st sees "Session full" — RSVP blocked
- **Pass:** Capacity enforced.

### TEST 8.6 .ics export
- **Steps:** Public event page → Add to calendar → download .ics
- **Expected:** .ics file has all sessions with correct times, location, description
- **Pass:** Imports into Google Calendar without errors.

### TEST 8.7 Public agenda filter by track (Bundle 9 / B9-3)
- **Steps:** Public event page → click a track pill
- **Expected:** Only sessions in that track displayed
- **Pass:** Filter works client-side without page reload.

---

## Section 9: Communications

### TEST 9.1 [SMOKE] Send announcement (immediate)
- **Steps:** Announcements → Compose, write body, send to all attendees
- **Expected:** Email arrives at all confirmed attendees within 5 min, push notifications fire
- **Pass:** Email + push both arrive.

### TEST 9.2 Schedule announcement
- **Steps:** Announcements → Compose, schedule for +10 minutes, send
- **Expected:** Status = "scheduled", cron picks it up at scheduled time, status → "sending" → "sent"
- **Pass:** Email arrives within 1 min of scheduled time.

### TEST 9.3 Announcement targeting (VIP only)
- **Preconditions:** Two ticket types: VIP and General, attendees of each
- **Steps:** Compose, audience filter = VIP ticket, send
- **Expected:** Only VIP attendees receive it
- **Pass:** General attendees do NOT get the email.

### TEST 9.4 [SMOKE] Email greeting format
- **Steps:** Open any received email from Prezva
- **Expected:**
  - Subject does not contain "{title}" or "undefined"
  - Body starts with "Hi <FirstName>" not "Hi <FullName>"
  - Body does not contain "Hi null" or "Hi undefined"
  - Footer has org name + Prezva attribution
- **Pass:** All four.

### TEST 9.5 Email unsubscribe
- **Steps:** Click unsubscribe link in any marketing-like email
- **Expected:** Confirmation page "You've been unsubscribed", subsequent announcements skip this user
- **Pass:** Unsubscribed user does not receive next announcement.

### TEST 9.6 Push notification arrival
- **Preconditions:** Install Prezva PWA on iPhone, allow notifications
- **Steps:** Send announcement with push channel enabled
- **Expected:** Push arrives on iPhone within 30s, tapping opens the relevant event page
- **Pass:** Push works.

---

## Section 10: Certificates

### TEST 10.1 [SMOKE] Configure certificate template
- **Steps:** Certificates → Configure template → upload signature, set min attendance 80%, save
- **Expected:** Template saved, preview shows attendee name + event details
- **Pass:** Save succeeds.

### TEST 10.2 Eligibility — meets threshold
- **Preconditions:** Attendee attended 80%+ of sessions
- **Steps:** Click "Check eligibility" for that attendee
- **Expected:** Eligible, can issue certificate
- **Pass:** Eligibility passes.

### TEST 10.3 Eligibility — below threshold
- **Preconditions:** Attendee attended 50% of sessions
- **Steps:** Same as 10.2
- **Expected:** Not eligible, reason: "Below 80% attendance threshold"
- **Pass:** Eligibility correctly rejects.

### TEST 10.4 Bulk issue (Bundle 9 / B9-6)
- **Steps:** Certificates page → "Issue to all eligible" → confirm
- **Expected:** Each eligible attendee receives a certificate email + PDF link
- **Pass:** Counts match.

### TEST 10.5 Attendee downloads own certificate
- **Steps:** Attendee logs in, visits `/e/<slug>/certificate`
- **Expected:** Certificate PDF available for download, includes their name + org logo + signature
- **Pass:** PDF is valid and complete.

### TEST 10.6 Public certificate verification
- **Steps:** Visit `/verify/<certificate_id>` (from QR on certificate or email)
- **Expected:** Shows: attendee name, event title, date, "Valid certificate" — without auth
- **Pass:** Public verification works.

---

## Section 11: Surveys

### TEST 11.1 [SMOKE] Create survey
- **Steps:** Surveys → New, add 3 questions (text, multiple choice, rating), publish
- **Expected:** Survey live, accessible to attendees
- **Pass:** Attendees can see it.

### TEST 11.2 Attendee responds to survey
- **Steps:** As attendee, complete survey
- **Expected:** Response saved, can edit until close, points awarded if enabled
- **Pass:** Response visible to organizer.

### TEST 11.3 Survey results — aggregate
- **Steps:** Organizer views results page
- **Expected:** Response count, distribution per question (e.g. bar chart for multiple choice)
- **Pass:** Aggregates accurate.

### TEST 11.4 Survey CSV export
- **Steps:** Click "Export to CSV"
- **Expected:** Download contains one row per response, columns for each question
- **Pass:** CSV opens in Excel/Sheets correctly.

### TEST 11.5 Close survey
- **Steps:** Surveys → Close
- **Expected:** Attendees can no longer respond, results still visible
- **Pass:** New responses blocked.

---

## Section 12: Integrations (post-Bundle 7)

### TEST 12.1 Zoom — connect
- **Steps:** Org settings → Integrations → Zoom → Connect, complete OAuth
- **Expected:** Status = connected, organization name shown
- **Pass:** OAuth flow completes.

### TEST 12.2 Zoom — create meeting on session
- **Steps:** Edit session → "Create Zoom meeting" → fill details, save
- **Expected:** Meeting created in Zoom with correct title/time/duration, join URL stored on session
- **Pass:** Verify in Zoom dashboard.

### TEST 12.3 Mailchimp — connect + sync
- **Steps:** Connect Mailchimp, select list from dropdown (B7-8 fix), register an attendee
- **Expected:** Attendee appears in Mailchimp list within 60s
- **Pass:** Sync works.

### TEST 12.4 Google Forms — auto-extract form ID
- **Steps:** Paste a full Google Forms URL (not just the ID)
- **Expected:** Form ID extracted automatically, validation succeeds
- **Pass:** No manual ID extraction needed.

### TEST 12.5 Eventbrite — import attendees
- **Steps:** Connect Eventbrite, select source event, click "Import"
- **Expected:** Attendees imported into Prezva, statuses preserved, no duplicates
- **Pass:** Counts match between platforms.

### TEST 12.6 SharePoint — file picker
- **Steps:** Pick a SharePoint file to attach to event
- **Expected:** File link stored, attendees can access via attached resource
- **Pass:** Resource accessible.

### TEST 12.7 Outlook calendar — add event
- **Steps:** "Add to Outlook" button on event settings
- **Expected:** Outlook calendar invite created with all event details
- **Pass:** Invite arrives in Outlook.

---

## Section 13: Stripe & payments

### TEST 13.1 [SMOKE] Stripe Connect onboarding
- **Preconditions:** Org owner has not yet onboarded
- **Steps:** Org settings → Connect Stripe → complete onboarding flow
- **Expected:** Returns to Prezva with `charges_enabled: true`
- **Pass:** Status shows green.

### TEST 13.2 Webhook — checkout.session.completed
- **Steps:** Complete a paid registration
- **Expected:** Webhook fires, registration moves from pending to confirmed
- **Pass:** Status updates correctly.

### TEST 13.3 Webhook — payment_intent.payment_failed
- **Steps:** Use a card that fails after auth (rare; or simulate via Stripe CLI `stripe trigger`)
- **Expected:** Registration stays pending, attendee notified
- **Pass:** No half-completed state.

### TEST 13.4 Refund — full
- **Steps:** Attendees → select registration → Refund → full amount
- **Expected:** Stripe refund processed, registration cancelled, attendee gets refund email
- **Pass:** All three.

### TEST 13.5 Refund — partial
- **Steps:** Same as 13.4 but enter partial amount
- **Expected:** Partial refund processed, registration stays active
- **Pass:** Stripe shows correct partial amount.

### TEST 13.6 Stripe requirements display (Bundle 9 / B9-9)
- **Preconditions:** Connect account with pending requirements
- **Steps:** View Connect status
- **Expected:** Pending requirements listed with human-readable labels and "Complete in Stripe" links
- **Pass:** Each requirement is actionable.

### TEST 13.7 Webhook signature verification
- **Steps:** Manually POST to `/api/webhooks/stripe` with no signature
- **Expected:** 400 Bad Request
- **Pass:** Unauthorized requests rejected.

### TEST 13.8 Disconnect Stripe
- **Steps:** Org settings → Disconnect Stripe, confirm
- **Expected:** `charges_enabled: false`, but Express account preserved (can reconnect)
- **Pass:** Cannot accept new payments, existing data preserved.

---

## Section 14: Multi-tenant isolation (CRITICAL)

### TEST 14.1 [SMOKE] User in Org A cannot see Org B data
- **Preconditions:** Logged in as `owner@test.prezva.app` (Org A only)
- **Steps:** Try to navigate to `/orgs/<orgB-id>/settings` directly
- **Expected:** 403 or 404 or redirect to /dashboard
- **Pass:** No data leak.

### TEST 14.2 Direct event URL probing
- **Steps:** Copy event UUID from Org A, replace with Org B event UUID
- **Expected:** 403 Not authorized
- **Pass:** Server checks org membership.

### TEST 14.3 API enumeration — events list
- **Steps:** `curl https://prezva.app/api/events` with Org A's session cookie
- **Expected:** Returns only Org A's events
- **Pass:** No Org B events in response.

### TEST 14.4 Server action cross-org call
- **Steps:** Use browser DevTools to call a server action with Org B's eventId
- **Expected:** Server action throws "Insufficient permissions"
- **Pass:** Auth check catches it.

### TEST 14.5 Storage isolation — uploads
- **Steps:** Org A user tries to upload to Org B's event paths
- **Expected:** 403, path validation rejects
- **Pass:** Cannot write to other orgs' folders.

---

## Section 15: Mobile & PWA

### TEST 15.1 [SMOKE] Public event page on iPhone
- **Steps:** Open `/e/<slug>` on iPhone Safari
- **Expected:** Page renders, all CTAs reachable, no horizontal scroll
- **Pass:** Visually clean.

### TEST 15.2 Registration on mobile
- **Steps:** Complete a registration on iPhone, including Stripe
- **Expected:** All form fields accessible, payment works, confirmation page works
- **Pass:** Full flow on mobile.

### TEST 15.3 QR scan from phone camera
- **Steps:** Open `/events/<slug>/checkin` on phone, scan another phone's QR
- **Expected:** Camera permission requested, scan works, check-in completes
- **Pass:** Works without errors.

### TEST 15.4 PWA install
- **Steps:** Open Prezva on iPhone, Safari → Share → Add to home screen
- **Expected:** App icon appears on home screen, opens to Prezva, runs standalone (no browser chrome)
- **Pass:** Standalone mode works.

### TEST 15.5 Push notification permission
- **Steps:** After PWA install, organizer sends a push announcement
- **Expected:** Push prompt appears on first event view, after allowing push arrives
- **Pass:** Push works on installed PWA.

### TEST 15.6 Offline check-in queue
- **Steps:** Enable airplane mode on iPad, scan a few QRs
- **Expected:** Check-ins queued locally, sync when back online
- **Pass:** No data lost.

---

## Section 16: API tests (curl examples)

Use these against staging.prezva.app with a valid session cookie.

### TEST 16.1 Get current user
```bash
curl -b "sb-access-token=$TOKEN" https://prezva.app/api/auth/me
```
Expected: 200, JSON with user data.

### TEST 16.2 List events (own org)
```bash
curl -b "sb-access-token=$TOKEN" https://prezva.app/api/events
```
Expected: 200, JSON array, only your org's events.

### TEST 16.3 Photo upload (B6-2 hardened)
```bash
curl -X POST -b "sb-access-token=$TOKEN" \
  -F "file=@test.jpg" \
  -F "eventId=$EVENT_ID" \
  https://prezva.app/api/photo-upload
```
Expected: 200 with `url` and `path`.

### TEST 16.4 Photo upload — too large (>5MB)
Use a 10MB file in 16.3.
Expected: 400 "File too large (max 5MB)".

### TEST 16.5 Photo upload — wrong type
Use a .pdf as file.
Expected: 400 "File type application/pdf not allowed".

### TEST 16.6 Photo upload — no auth
Same as 16.3 without `-b` cookie.
Expected: 401 Unauthorized.

### TEST 16.7 Cron endpoint — without secret
```bash
curl https://prezva.app/api/cron/scheduled-announcements
```
Expected: 401 Unauthorized.

### TEST 16.8 Cron endpoint — with secret
```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://prezva.app/api/cron/scheduled-announcements
```
Expected: 200, JSON with `processed` count.

### TEST 16.9 GDPR export
```bash
curl -b "sb-access-token=$TOKEN" https://prezva.app/api/gdpr/export
```
Expected: 200, JSON with all your data across all tables.

### TEST 16.10 GDPR delete
```bash
curl -X POST -b "sb-access-token=$TOKEN" https://prezva.app/api/gdpr/delete
```
Expected: 200, account deleted, session invalidated.

---

## Section 17: Performance & load

Run only on staging.

### TEST 17.1 Page load time — public event page
- **Tool:** Chrome DevTools Network tab or Lighthouse
- **Target:** First Contentful Paint < 1.5s, Time to Interactive < 3s
- **Pass:** Both under threshold.

### TEST 17.2 Registration completion time
- **Steps:** Time from clicking "Register" to confirmation page
- **Target:** < 5 seconds (excludes user input time)
- **Pass:** Under 5s.

### TEST 17.3 Concurrent registrations (load test)
- **Tool:** k6, autocannon, or similar
- **Target:** 50 concurrent users registering, p95 < 10s, error rate < 1%
- **Pass:** Within targets.

### TEST 17.4 Check-in scanner latency
- **Tool:** Manual timing
- **Steps:** Scan 20 QRs back to back
- **Target:** Each scan < 1.5s from camera capture to confirmation
- **Pass:** No queue buildup.

### TEST 17.5 Photo gallery with 1000 photos
- **Setup:** Seed 1000 photo entries
- **Target:** Initial load < 5s, infinite scroll smooth
- **Pass:** No janky scrolling.

---

## Final scorecard

After running, fill this out. Critical tests (SMOKE) failing = release blocker.

| Section | Tests passed | Tests failed | Critical fails | Notes |
|---|---|---|---|---|
| 1. Auth | / 7 | | | |
| 2. Organizations | / 5 | | | |
| 3. Event creation | / 7 | | | |
| 4. Tickets | / 11 | | | |
| 5. Registration | / 10 | | | |
| 6. Check-in | / 7 | | | |
| 7. Speakers | / 7 | | | |
| 8. Agenda | / 7 | | | |
| 9. Communications | / 6 | | | |
| 10. Certificates | / 6 | | | |
| 11. Surveys | / 5 | | | |
| 12. Integrations | / 7 | | | |
| 13. Stripe | / 8 | | | |
| 14. Multi-tenant | / 5 | | | |
| 15. Mobile | / 6 | | | |
| 16. API | / 10 | | | |
| 17. Performance | / 5 | | | |
| **TOTAL** | / 119 | | | |

Targets:
- SMOKE tests: 100% pass required (any failure = release blocker)
- Section 14 (multi-tenant): 100% pass required
- Overall: 90%+ pass for production-ready

---

## When to run

- **After every code change:** SMOKE tests (~30 min)
- **After every bundle merge:** SMOKE + the sections affected by that bundle
- **Weekly:** Sections 1-10 (~3 hours)
- **Monthly:** Full plan (~6 hours)
- **Before any release or big event:** Full plan + load test + stress test
