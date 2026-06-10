# GHL Events, powered by Prezva — Feature-by-Feature Offload Tally (v2, code+research verified)

_Authored 2026-06-10 by Claude Desktop. Governs GE-5 onward. Supersedes the high-level groupings in `prezva_ghl_offload_matrix.md` — this is the exhaustive, per-feature version Paul asked for. Pairs with `ghl_platform_reference.md` (deep GHL platform state) and `prezva_ghl_build_plan.md` (canonical build sequence)._

## The model (locked)
GHL is the **backbone**, not just the front door. Prezva is the piece GHL never built: the **event-execution engine**. Two lanes, equally important, one codebase:
- **Standalone lane** — every Prezva feature stays, fully used + maintained (Civitas, Whova-displacement, non-GHL customers). UNTOUCHED by anything here.
- **GHL-Events lane** — if GHL does it and nothing in Prezva's engine depends on the output, **GHL does it**. "Adopt GHL" is a *routing* decision for the embed surface, never a deletion of Prezva code.

## The verdict rule (applied to every row)
1. **KEEP** — Prezva's engine *computes* on the data (check-in, CE eligibility, attendance %, watch-time, badge contents, capacity). GHL structurally cannot. The moat.
2. **ADOPT** — GHL can do it and nothing in Prezva's engine depends on the output. **Default for every toss-up.**
3. **HYBRID (keep both, composed)** — output feeds Prezva's engine AND GHL has a richer front-end for the *artifact*. Prezva computes; GHL renders/delivers/verifies.
4. Standalone lane untouched in every case.
5. Every ADOPT/HYBRID row carries a **⚑ trigger-check**: confirm GHL fires the workflow trigger Prezva needs before relying on it.

## Data-flow patterns referenced below
- **Pattern A (GHL→Prezva push):** GHL workflow trigger → webhook → Prezva stores its own copy → Prezva engine computes on the stored copy. Use when Prezva computes on the data (the GE-4 dispatcher pattern). Reliable, real-time.
- **Pattern B (Prezva reads GHL on demand):** Prezva calls GHL API live when it needs to display GHL-owned data. Display-only — never a computation dependency (fragile).
- **Pattern C (Prezva→GHL push):** Prezva fires outbound on an event-execution action (check-in/cert/etc.) → GHL custom field/tag/stage, or Inbound-Webhook trigger to kick off GHL automations.

---

# SECTION 1 — THE MOAT (KEEP — GHL structurally cannot)

| # | Prezva feature | GHL today (2026, verified) | Verdict | Why / data flow |
|---|---|---|---|---|
| 1 | Offline QR check-in (scanner + manual + IndexedDB queue + reconnect sync + multi-device Realtime) | Static QR *generator* only (links to URLs/forms/payment). No scanner, no app, no per-attendee QR, no duplicate prevention, no offline. Community begging since 2020, unbuilt. | **KEEP** | The absolute core. Prezva computes attendance from scans. Fires Pattern C → GHL stage "Checked In" + tag. |
| 2 | Per-attendee unique QR | Static QR only (one code → one URL). | **KEEP** | QR is a DB-default per registration; identity-bound. GHL can't mint per-contact dynamic codes. |
| 3 | Agenda / sessions / tracks (7 types, multi-track, per-session capacity, conflict checker, room mgmt, ticket-gated sessions) | No session/agenda concept. Workaround = one booking-calendar per session type (appointment booking ≠ agenda). GHL runs its OWN LevelUp conference on this workaround. | **KEEP** | No GHL inputs exist. Pure Prezva. |
| 4 | Session-level attendance (session scan, attendance logs) | None. | **KEEP** | Feeds CE eligibility. Pattern C → GHL field/tag per session. |
| 5 | Badge design + PDF (drag-drop designer, 4+ templates, thermal + standard, reprint, batch) | None (QR generator can't render badge PDFs). | **KEEP** | Badge contents computed from registration/ticket data. |
| 6 | CE certificate **eligibility engine** (attendance-% rules, CE credit hours, bulk issuance by who attended) | Cannot compute eligibility — no event-attendance inputs. Can only issue when told. | **KEEP** | The Civitas/association moat. Prezva decides *who qualifies*. (Cert *artifact* → see HYBRID §3, row 31.) |
| 7 | Capacity enforcement (`trg_enforce_capacity` BEFORE-INSERT hard backstop + waitlist auto-promote) | Price-level `availableQuantity` decrements on GHL purchase (native pre-payment gate) BUT can't see comps/manual regs; drifts. | **KEEP** | Prezva = source of truth (comps + manual consume seats GHL never sees). GHL inventory = front gate only; Prezva trigger = hard backstop. |
| 8 | Video broadcast (Mux RTMP→HLS, CE progress bar, live chat/Q&A/polls) | No streaming infra. | **KEEP** | GE-7. Watch-time feeds CE. |
| 9 | Interactive rooms + 1-on-1 (LiveKit speaker/panelist, moderator, ephemeral networking rooms) | No video rooms. | **KEEP** | GE-7. |
| 10 | Recording / simulive / organizer MP4 export | None. | **KEEP** | Headline Whova gap too. |
| 11 | Watch-time tracking → attendance/CE | None. | **KEEP** | Computation dependency. |
| 12 | Speaker hub + magic-link portal (bio/photo/handout self-service, session Q&A) | No speaker concept. (Calendars assign team members to bookings — not speakers.) | **KEEP** | Pure Prezva. Speaker *scheduling* of 1-on-1s could lean on GHL calendars — see §2 row 27. |
| 13 | Sponsor booths + QR lead capture + passport stamp game | No event-sponsor layer. | **KEEP** | Lead-scan feeds leaderboard; passport is event-action gamification. |
| 14 | Volunteer mgmt + magic-link portal (roles, shifts, clock in/out, hours export) | No event-staffing layer. | **KEEP** | Pure Prezva. |
| 15 | Event-action gamification (leaderboard 8 categories, trivia, icebreakers, photo contest, passport) | **Gamification 2.0** in Communities: points/badges/9 levels/leaderboards + workflow trigger & action for points — BUT keyed to community engagement (posts/likes) + course completion, NOT event actions. | **KEEP** (+ optional bridge) | GHL can't award points for check-in/session-scan/passport/trivia (no such events). Prezva owns event-action gamification. ⚑ OPTIONAL: Prezva → GHL "Grant Leaderboard Points" action via Inbound Webhook if org also runs a GHL community. Enhancement, not MVP. |
| 16 | People directory + matchmaking (opt-in, Jaccard interest matching) | Contacts ≠ attendee networking. No matchmaking. | **KEEP** | Attendee-to-attendee, event-scoped. |
| 17 | Wallet passes (Apple .pkpass + Google Wallet JWT, per-org branding) | Cannot issue wallet passes. | **KEEP** | Tied to QR/registration. |
| 18 | AMS member verification (WildApricot, iMIS, MemberClicks, YourMembership, Glue Up, Neon, Novi) | Not a GHL capability (association-specific). | **KEEP** | Member-of-record gate for member-only tickets. |
| 19 | Press portal / MC hub / lobby display | No equivalent. | **KEEP** | Event-ops surfaces. |
| 20 | Event analytics (check-in rate, session attendance, CE completion, capacity %) | GHL reporting = CRM/marketing/attribution, not event metrics. | **KEEP** | Computed from Prezva event data. (CRM/attribution analytics → ADOPT, §2 row 26.) |
| 21 | Event record + lifecycle + attendee↔event linkage | Custom Objects can hold event *data shells* (no behavior). | **KEEP** | The spine. (Optional: mirror to a GHL "Event" custom object for GHL-side visibility — enhancement.) |

---

# SECTION 2 — ADOPT GHL (default; GHL does it, nothing in the engine depends on it)

| # | Prezva feature (standalone keeps it) | GHL today | Verdict | Data flow / ⚑ trigger-check |
|---|---|---|---|---|
| 22 | Contact / CRM storage (Supabase attendee tables) | Core competency. Contacts, custom fields, tags, smart lists, dedupe/merge, engagement scores. | **ADOPT** | GHL = system of record for the person. Prezva holds event-scoped linkage only. ⚑ ContactCreate/Update webhooks (native). |
| 23 | Marketing email sequences / announcements (Resend broadcasts) | Workflow engine: drips, sequences, conditional sends, multi-channel. Far more robust. | **ADOPT** | Prezva fires tag/Inbound-Webhook → GHL workflow sends. ⚑ caveat: LC Email = shared Mailgun, no throttling, deliverability risk → organizer should run custom SMTP (Mailgun/Postmark) for anything that must land. |
| 24 | SMS campaigns (Telnyx) | Native LC Phone SMS + workflows. | **ADOPT** | GHL fires; Prezva triggers. Drops Telnyx CRX9TO7 carrier dependency in GHL mode entirely. |
| 25 | Generic / marketing surveys (6 types) | Surveys = multi-page, conditional logic v2, per-answer scoring w/ running total exposed as CRM data point, partial capture. MORE capable than Prezva's. | **ADOPT** | ⚑ "Survey/Form/Quiz Submitted" trigger (native). (Event-tied/CE survey → HYBRID §3 row 30.) |
| 26 | CRM / attribution / marketing reporting | Native dashboards, attribution, pipeline reporting. | **ADOPT** | GHL owns CRM analytics. (Event-execution analytics stay Prezva — §1 row 20.) |
| 27 | 1-on-1 / speaker scheduling (.ics only in Prezva) | Calendars: round-robin, collective, service/rental calendars, booking links, Google/Outlook sync. | **ADOPT** | For booking-type scheduling (speaker office hours, 1-on-1 slots). NOT the session agenda (that's KEEP §1 row 3). |
| 28 | Reminder scheduling (Trigger.dev scheduled sends) | Workflow reminders, drip, wait steps. | **ADOPT** | Pre-event reminders, no-show follow-up, post-event nurture = GHL workflows fired by Prezva status. |
| 29 | Community feed (Post/Meetup/Article + moderation) | **Communities** (strong: groups, channels, gamification, magic-link, Skool-importer, mobile). Marketed as "Skool killer." | **ADOPT** | GHL Communities > Prezva's event feed for a persistent community. ⚑ Community triggers (native). Caveat: GHL community is org-persistent, not event-scoped/transient — if a client wants a throwaway per-event feed, Prezva's still fine, but default = GHL. |
| 32 | Registration capture form (Prezva `/register` microsite form) | Order forms + funnels + forms-with-payment. | **ADOPT** | GHL is the front door. GHL order form sells the ticket → Pattern A webhook → Prezva creates registration (GE-4, done). Prezva's own form = standalone lane only. |
| 33 | Payments / checkout (Stripe Connect) | Stripe/PayPal/Square/Authorize.net/NMI + price-level inventory. | **ADOPT** | DONE in GE-4 (payment-provider-agnostic inbound). GHL collects; Prezva receives opaque "paid" signal. |
| 34 | Appointment booking (.ics generation) | Full calendars/booking. | **ADOPT** | Same as row 27. |
| 35 | Media storage (Supabase storage) | Media Storage (with visibility limits). | **ADOPT** (either) | Toss-up → default GHL for embed-mode asset hosting; Prezva storage fine where tied to event records. |
| 36 | Coupons / discount codes (Prezva ticket discounts) | Native coupons (apply/limit/expire/redeem + workflow events). | **ADOPT** | GHL owns the checkout, so GHL owns the discount. Prezva reads final `amount` from the order webhook (already does). |

---

# SECTION 3 — HYBRID (keep both, composed: Prezva computes, GHL renders/delivers/verifies)

| # | Prezva feature | GHL today | Verdict | Composition / ⚑ trigger-check |
|---|---|---|---|---|
| 30 | Event-tied / CE surveys (session feedback, NPS tied to attendance) | Surveys strong + scoring exposed as CRM data point. | **HYBRID** | GHL builds + hosts the survey (better UX); ⚑ "Survey Submitted" trigger → Pattern A webhook → Prezva stores result against the registration → CE engine reads Prezva's copy. GHL is front; Prezva computes CE. **The canonical pattern.** |
| 31 | CE certificate **artifact** (PDF gen, `/verify/{id}` page, delivery, /me/wallet) | Certificate builder: design + dynamic fields + expiry + **manual/offline issuance (explicitly for external achievements)** + modern public verification/credential page + **LinkedIn add-to-profile** + social share + PNG. | **HYBRID (keep both — Paul, 2026-06-10)** | Prezva computes eligibility + issues its own CE cert (Civitas story intact). THEN optionally fires GHL's manual-issue cert action → attendee ALSO gets GHL's slicker verification page + LinkedIn button. Pipeline: Prezva eligibility → issue in both. ⚑ "Certificates Issued" trigger + manual-issue action (native). GHL's verify+LinkedIn > Prezva's `/verify/{id}` for shareability; Prezva's CE-backed verification = the record of authority. |
| 37 | Transactional event email (QR delivery, cert delivery, receipt) | Workflow email, but LC Email shared-infra deliverability risk. | **HYBRID / ADOPT-with-caveat** | In GHL-front mode these route through GHL (it owns the contact + comms). ⚑ STRONG caveat: organizer must be on custom SMTP (Mailgun/Postmark), NOT shared LC Email, for QR/cert emails that MUST arrive. Config recommendation surfaced in embedded Settings, not a Prezva build. |
| 38 | Contact data sync (n/a standalone) | Bidirectional GHL contact ↔ Prezva attendee. | **HYBRID** | GHL owns contact; Prezva owns event linkage. Pattern A in, Pattern C out. The GE-4 dispatcher already does the spine of this. |

---

# SECTION 4 — TALLY

**KEEP (the moat) — 21 features:** offline QR check-in, per-attendee QR, agenda/sessions/tracks, session attendance, badges, CE eligibility engine, capacity enforcement, video broadcast, interactive/1-on-1 rooms, recording/simulive/MP4, watch-time, speaker hub/portal, sponsor booths/passport, volunteer mgmt, event-action gamification, directory/matchmaking, wallet passes, AMS verification, press/MC/lobby portals, event analytics, event record/lifecycle.

**ADOPT GHL — 13 features:** contact/CRM storage, marketing email sequences, SMS, generic surveys, CRM/attribution reporting, 1-on-1/speaker scheduling, reminder scheduling, community feed, registration capture, payments/checkout, appointment booking, media storage, coupons/discounts.

**HYBRID (keep both, composed) — 4 features:** event-tied/CE surveys, CE certificate artifact, transactional event email, contact data sync.

## What the product becomes
Prezva-in-GHL is unmistakably **the event-execution engine** — check-in/offline/QR, agenda/sessions, badges, CE eligibility, video+watch-time, capacity, sponsor/speaker/volunteer ops, wallet passes, event-action gamification, AMS, and the ops portals. Everything that is CRM/marketing/comms/payments/scheduling/community/credential-sharing = GHL. A clean story, not a second CRM bolted on.

## Standalone lane (lane one) — explicit
Every ADOPT and HYBRID feature **remains fully built, used, and maintained in standalone Prezva.** Civitas / Whova-displacement / non-GHL customers get the complete Prezva product with Prezva's own CRM-lite, surveys, email, certificates, registration, payments. "Adopt GHL" routes ONLY the GHL-Events embedded surface. No code deleted.

## Trigger-verification backlog (⚑ — confirm before relying on, per feature)
All confirmed present in GHL's current trigger/action catalog (per `ghl_platform_reference.md` §4 + 2026-06-10 research): Payment Received/Refund/Failed, Order Submitted, Survey/Form/Quiz Submitted, Certificates Issued + manual issue action, Community triggers + Grant Leaderboard Points action, Contact Create/Update, Inbound Webhook trigger (Prezva→GHL), Custom Code action, Send Data (Webhook out). Re-verify each against the live account when the specific feature is wired (GHL ships weekly).

## GE-phase implications (how this reshapes the remaining build)
- **GE-5 (next):** the moat. Build `ticket_type_product_mappings` (closes the GE-4 loop) + expose KEEP features in the embed (attendees screen, check-in/offline, badges, sessions, CE eligibility). Each fires Pattern C outbound. Do NOT build survey/email/CRM UI in the embed — those are GHL.
- **GE-6 (attendee app):** white-label the attendee surface for KEEP features only (agenda, QR, sessions, certificate retrieval, gamification). Comms/nurture = GHL.
- **GE-7 (video):** KEEP, watch-time → CE.
- **HYBRID rows** are mostly Pattern-A wiring (survey→CE, cert artifact) — small, fold into GE-5/GE-6 where the consuming engine lives.
- **ADOPT rows** are mostly "don't build it in the embed" + a few outbound triggers — they REDUCE GE scope, not add to it.

_Re-verify GHL capability claims against help.gohighlevel.com + ideas.gohighlevel.com/changelog before customer-facing use._
