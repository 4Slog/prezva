# Golden Test Dataset — Data Spec (v0.1 DRAFT for review)

Status: DRAFT for Paul's review. No seed code runs until this is approved.
Date: 2026-05-30 · Target DB: Supabase `jmhxyyrleipcorvkmxfk` (the one prod DB)
Grounded in the live schema mapped 2026-05-30 (95 public tables, FK graph, enums).

Goal: a single authoritative, regenerable dataset that makes the platform read as
~6 months live and exercises every block of the system — with internally consistent
counts (no 20-vs-19), sane round times (no :09:22), and ≥1 row per state/branch.

--------------------------------------------------------------------------------
## 0. WIPE & PRESERVE (destructive — backup + explicit go required)
- BACKUP FIRST: Supabase backup/snapshot + a local `pg_dump` to the Mac before any truncate.
- PRESERVE: only `auth.users` row for sowu.paul@gmail.com (43280c9b-60a7-4884-94b0-1c80e5af1a9d)
  and its auth.identities/sessions. Everything else goes.
- DELETE: all 7 other auth.users (thesowus@, neworg.test, orgadmin.test, orgstaff.test,
  retest.onboard3@…, sarah.mitchell@eventpro.com, testorg.phase2@) + ALL public app data.
- Seed then rebuilds sowu.paul's profile row + org memberships from scratch.
- Wipe is scoped + explicit in the seed (TRUNCATE public app tables; preserve auth schema).

## 1. STRIPE — real test-mode Connect (prod-as-test)
- App env flips to test keys (sk_test/pk_test/test webhook secret) for the build/test phase.
- Each org that sells paid/donation/group tickets gets a REAL test connected account (acct_…)
  created by the seed via the Stripe test key, onboarded to charges+payouts-enabled using
  Stripe magic values: DOB 1901-01-01, ID 000000000, address_full_match, bank 110000000/000999999991.
- Paid registrations = real test Checkout sessions (test card 4242…) → webhook → DB sync.
- Stored on org/event rows as the platform expects (acct_…, charges_enabled, etc.).
- LAUNCH NOTE: test acct_/payment IDs do NOT carry to live mode. Before launch: flip to live
  keys, re-seed clean baseline (or curate demo data out), real organizers onboard fresh.

## 2. IMAGES & STORAGE BUCKET (bucket approved)
- Bucket: public-read `avatars`/`assets` bucket(s), authenticated-write + RLS. Config proposed
  for approval before creation (security-sensitive). Separate locked bucket for CE/video later.
- Real assets: Paul rclones Drive logos onto the Mac (4S Logistics, L&L, enanse, Craboo, BatchAI,
  orange round, etc.) → used as org/sponsor/exhibitor logos.
- Generated: 48 speaker headshots + attendee avatars (Paul approved generated) to fill gaps.
- Deliberate gap: 1 speaker with NO photo (model incompleteness); photo-vs-no-photo badge split.
- Resolution chain unchanged: /me avatar → token-portal upload → organizer-set → initials.

## 3. PERSONAS (dual-row: every persona = auth.users + profiles)
- GOTCHA from FK map: user refs split targets — some FK → profiles (registrations.user_id,
  events.created_by, org_members.user_id, surveys.created_by), some FK → auth.users
  (leaderboard_points, volunteers, community_posts.author_id, session_attendance, session_questions).
  Seed must use the correct target per table. Both rows created for each persona.
- HERO (real controllable inboxes, real logins/photos, hands-on testing):
  sowu.paul@ (exists, KEEP), + haynessowu@, ssss.logistics.llc@, vmtrasaco@, plus @prezva.app
  aliases (forward to sowu.paul@). NOTE: hero inboxes other than sowu.paul must be signed up
  by Paul to hold real logins (account creation is Paul's action). Seed can still create their
  profile/persona rows; real auth login = Paul signs up.
- POPULACE (synthetic volume): Gmail plus-addressing sowu.paul+roleNNN@gmail.com (delivers to
  real inbox) — hundreds of attendees without hundreds of real accounts.
- CROSS-ORG: ≥3 people hold roles in 2 orgs (e.g., a speaker at the Association who is also an
  attendee at the Chamber; a Meridian org-admin who is a sponsor contact at OpenSource ATL) —
  tests unified identity AND cross-tenant isolation (B6-002).

## 4. THE FOUR ORGANIZATIONS (created ~Nov–Dec 2025 for 6-month age)
1. Meridian Event Collective — events consultancy. In-person + hybrid, sponsor/exhibitor-heavy,
   free+paid+group tickets. Hosts the flagship Birmingham Small Business Week. Owner: a Meridian
   admin persona; sowu.paul = platform operator (super-admin) + member.
2. Southeast Association of Urban Planners (SAUP) — professional association. CE-credit events,
   certificate templates with CE hours, sessions carrying ce_credit_hours. GAPP analog.
3. Augusta Metro Chamber of Commerce — networking/mixers. Community + sponsors heavy,
   paid + donation tickets, recurring monthly events.
4. OpenSource ATL — tech nonprofit/meetup. Virtual + hybrid, free + donation, smaller, livestream
   blocks, community-driven.

## 5. EVENT TIMELINE (covers all event_status; today = 2026-05-30)
Full status coverage across orgs: draft · published · live · ended · archived · cancelled.
- Meridian: Birmingham SBW (May 3–9 2026, ENDED — rich post-event: certs/surveys/leaderboard/photos)
  + Fall Summit (Sep 2026, PUBLISHED — taking registrations now) + one DRAFT event.
- SAUP: CE Conference happening NOW (May 29–30 2026, LIVE — exercises live check-in, lobby, MC hub,
  session attendance, CE eligibility) + 2 past CE events (ENDED + ARCHIVED, issued certificates).
- Chamber: monthly mixers — 4 past (ENDED/ARCHIVED) + 1 UPCOMING (published) + 1 CANCELLED.
- OpenSource ATL: monthly virtual meetups — 3 past (ENDED) + 1 UPCOMING (hybrid) + 1 DRAFT.
- event_type coverage: in_person (Meridian/Chamber), hybrid (Birmingham Wed/Fri blocks, OSS ATL),
  virtual (OSS ATL). visibility: public / private / unlisted all represented.

## 6. FLAGSHIP — Birmingham Small Business Week (under Meridian, ENDED)
Source of exact floor detail: transcript 2026-05-30-16-21-10-prezva-fix-sweep-and-dataset.txt
(pull exact session/speaker names at build time). Shape:
- 7-day, May 3–9 2026, America/Chicago, in-person + hybrid (Wed + Fri virtual/stream blocks).
- Venues: Railroad Park (primary), The Forum (incl Room J/K), The Florentine, Innovation Depot, Mayawell Bar.
- ~30 top-level sessions + 7 sub-sessions: keynotes, panels, breakouts, networking, meals,
  doors-open markers, 2 virtual/hybrid stream blocks. SANE round times only (:00/:15/:30/:45).
- 2 tracks: Nonprofit (green, 2 sessions), Small Business (orange, 7 sessions).
- 48 speakers: 22 assigned, 26 unassigned, ~7 "edited" profiles, 1 missing photo.
- 2 Platinum sponsors, 6 exhibitors (cap 10): Passport Contest, Exhibitor Trivia, Compliance Docs,
  1-1 Meetings, Lead Retrieval.
- 13 ticket types (live event was all-free → WE ADD variety, see §7). Cap 500, ~546 list.
- Per-session registration (one person can hold multiple tickets — NOT unique headcount).
- Engagement realism targets: app downloads ~262, messages ~260, board posts ~614, photos ~116.

## 7. TICKETS & REGISTRATION DISTRIBUTION
- ticket_type enum = free/paid/donation only. "group/invite-only/virtual" modeled via flags +
  group_tickets / ticket_invite_allowlist / session_ticket_access. Across the dataset include:
  free, paid (several price points), donation, group (payer + members), invite-only (allowlist),
  virtual-only (session_ticket_access). Realistic prices.
- registration_status: hit ALL 5 — confirmed (majority), pending, cancelled, waitlisted, refunded.
- checkedIn ⊆ confirmed (invariant). check-in methods: qr_scan (majority), manual, kiosk, self.
- Backdated created_at spread across each event's registration window (6-month realism).
- Volume: Birmingham ~500+ regs (populace via plus-addressing); other events tens–low-hundreds.

## 8. ENGAGEMENT & HISTORY (T6 — what makes it look 6 months live)
For past/live events, accrue coherent history:
- check_ins + session_attendance (BOTH, coherent — note B6-005 split still pending; seed both so
  CE eligibility + leaderboard agree), daily_check_ins for multi-day.
- leaderboard_points via the wired actions (checkin/icebreaker/passport/trivia/community/survey),
  resolvable names (Batch-8 fix), realistic spread.
- surveys + survey_responses + survey_answers; session_feedback; issued_certificates for CE events
  (eligible AND ineligible attendees — edge case).
- community_posts→replies/upvotes/rsvps/photos; conversations/messages; group_conversations;
  meeting_requests; attendee_follows.
- icebreaker_completions, trivia_answers, passport_visits, photo_contest_entries+votes,
  session_questions(+upvotes)+session_polls(+votes).
- sponsor_leads (deduped per B6-006 fix), volunteers (with shifts), announcements (sent history),
  audit_logs, abandoned_carts, email_suppressions.

## 9. COVERAGE MATRIX (coverage-by-construction)
- Every enum value ≥1 row (statuses, types, roles, methods, visibility, question types).
- Every persona type: attendee, speaker, volunteer, sponsor, press, VIP, staff, exhibitor,
  organizer — incl. ≥1 person wearing multiple hats across orgs.
- Edge cases: unicode/RTL/long names (José Müller-Štěpánková, العربية, 390-char name),
  photo vs no-photo badge split, CE-eligible vs CE-ineligible attendee, fully-non-Latin title,
  cancelled+refunded reg, waitlisted reg, group ticket payer+members, invite-only allowlist hit/miss.

## 10. STAGED RUN PLAN (idempotent, flag-driven)
Stages (run --only=<stage> or --all), each ends with a count-invariant check:
  0 wipe (gated)  →  1 personas (auth+profiles)  →  2 orgs+members+templates  →  3 events
  →  4 event-config (tracks/rooms/tickets/discounts/sponsors/speakers/surveys/icebreakers/trivia)
  →  5 sessions+session-links  →  6 registrations(+stripe test checkout)  →  7 engagement/history
  →  8 images (bucket upload + wire URLs)
Invariants checked per stage: checkedIn ≤ confirmed; session_attendance ⊆ registrations;
  no negative-derivable counts; per-event registration_count/checked_in_count match live truth.
Driven by: human-readable data file (this spec → YAML/JSON) + scripts/seed/golden-dataset.ts.

## 11. OPEN DECISIONS FOR PAUL
- a) Org names above OK, or rename any?
- b) Hero inboxes to actually sign up now (besides sowu.paul) — which, and when?
- c) Approx total attendee volume target (Birmingham ~500 + others) — fine, or scale up/down?
- d) Bucket name/visibility: propose single public-read `public-assets` to start — OK?

--------------------------------------------------------------------------------
## DECISIONS LOCKED — 2026-05-30 (supersede conflicting notes above)

#1 Org names: approved as-is (Meridian / SAUP / Augusta Metro Chamber / OpenSource ATL).

#2 Hero accounts + auth model:
- Interactive heroes = sowu.paul@gmail.com (KEPT, Google OAuth) + paul@prezva.app (email+password,
  forwards to sowu.paul). paul@prezva.app is the main hero/operator login.
- Password is set by Paul out-of-band (Supabase dashboard "Add user", or a HERO_PAUL_PASSWORD value
  in .env.local that the seed reads) — NEVER hardcoded in the repo, NEVER stored in memory. The seed
  matches the manually-created login to the Meridian-owner persona BY EMAIL.
- Populace = mostly GUEST registrations (registrations.user_id NULL — realistic, no accounts) + a
  modest set of synthetic logged-in attendees (auth.users fixtures, random throwaway creds, never
  stored) so community/leaderboard/messaging have logged-in actors.

#3 Scale ladder (small → very large), one event per rung:
- OpenSource ATL virtual meetup ........ small      (~40)
- Augusta Metro Chamber mixer ........... medium    (~150)
- SAUP CE conference (LIVE now) ......... medium-lg (~300)
- Birmingham Small Business Week ........ large      (~520, the flagship replica)
- ADD: one VERY LARGE event ............. very large (~2,500) to stress list/counter/leaderboard/
  analytics at scale — proposed as an OpenSource ATL annual virtual summit (virtual scales cheapest).

#4 Storage buckets — CORRECTED. The app hardcodes specific bucket names (none exist yet = the
   "silent upload failure" blocker). Create exactly what the code references:
- org-assets       (public-read) : org logos, sponsor logos, speaker photos   [from BUCKET_MAP]
- event-assets     (public-read) : event covers, venue maps                   [from BUCKET_MAP]
- user-avatars     (public-read) : attendee/user avatars                      [storage.from]
- event-photos     (public-read) : community/event photos                     [storage.from]
- event-documents  (private?)    : event documents (consider attendee-gated)  [storage.from]
- speaker-handouts (private?)    : speaker handouts (consider attendee-gated)  [storage.from]
- Sensitive artifacts (CE certs, ID docs, video) → SEPARATE locked bucket LATER, not in this set.
- Each needs an RLS policy (public read on display buckets; authenticated+org-scoped write). Exact
  policies proposed for Paul's approval BEFORE creation (security-sensitive — never silently created).

--------------------------------------------------------------------------------
## DECISION UPDATE — passwords: one-time link, user-set on first login (2026-05-30)
Supersedes the #2 "set password / .env" note. Use Prezva's EXISTING native flow — no new feature.
- Interactive heroes (paul@prezva.app, any others) are seeded PASSWORDLESS via the existing invite
  path: admin.inviteUserByEmail / admin.generateLink({type:'invite', redirectTo:'/onboarding'}) —
  same mechanism src/app/api/admin/users/onboard already uses.
- Seed mints the one-time links (and/or fires the invite email via Resend — prezva.app domain is
  verified; all hero aliases forward to sowu.paul@gmail.com, so Paul receives every link).
- On first click the user lands on /onboarding → /auth/update-password and sets THEIR OWN password.
  No temp password is ever generated, stored, committed, or held in memory.
- NO forced-rotation feature needed: the invite flow already enforces user-set-on-first-login.
  (A temp-password + must_change flag would be redundant custom code — skip it.)
- Populace: guest registrations (no auth) + synthetic logged-in fixtures created confirmed with a
  random throwaway secret that is never surfaced (they never log in interactively).
- Net: Paul creates NO accounts by hand and types NO password into anything we keep — he just
  clicks the one-time links that arrive in his inbox and sets passwords there.

--------------------------------------------------------------------------------
## BUCKET + RLS PROPOSAL — for approval before creation (2026-05-30)
Grounded in code: all writes go through authenticated, org-membership-checked API routes using the
service-role admin client (bypasses RLS). Reads: getPublicUrl (public buckets) vs createSignedUrl (private).

Six buckets (exactly what the code references — none exist today = the "silent upload failure" blocker):
| bucket            | access  | read via       | holds                                   | size  |
|-------------------|---------|----------------|-----------------------------------------|-------|
| org-assets        | PUBLIC  | getPublicUrl   | org logos, sponsor logos, speaker photos| 5 MB  |
| event-assets      | PUBLIC  | getPublicUrl   | event covers, venue maps                | 5 MB  |
| user-avatars      | PUBLIC  | getPublicUrl   | attendee/user avatars                   | 5 MB  |
| event-photos      | PUBLIC  | getPublicUrl   | community/event photos                  | 10 MB |
| event-documents   | PRIVATE | createSignedUrl| event documents                         | 25 MB |
| speaker-handouts  | PRIVATE | createSignedUrl| speaker handouts                        | 25 MB |

RLS posture (defense-in-depth, since writes are service-role-mediated):
- Public buckets: public=true (enables public reads). NO client INSERT/UPDATE/DELETE policy → RLS
  default-denies any direct client upload; the API routes still work via service role. Image MIME
  allowlist enforced at bucket level (jpeg/png/webp [+svg for logo/cover buckets only]).
- Private buckets: public=false. NO anon/authenticated policies at all → all access is service-role
  only; the app mints short-lived signed URLs server-side after its own auth checks.
- svg allowed only on org-assets/event-assets (logos/covers); excluded from avatars/photos (svg-XSS).
- Sensitive artifacts later (CE certs, ID docs, video) → a SEPARATE locked bucket, not in this set.

Effect: closes the silent-upload blocker AND unblocks avatar/logo/photo rendering for the dataset.
Creation is via Supabase MCP apply_migration — GATED on Paul's explicit approval.

--------------------------------------------------------------------------------
## CORRECTION — buckets ALREADY EXIST (verified 2026-05-30)
The ledger's "zero storage buckets / silent upload failure" item is STALE. Querying storage.buckets
directly shows all needed buckets already present + well-configured (insert was a 0-row no-op):
  org-assets(pub,2MB,+svg) · event-assets(pub,5MB) · user-avatars(pub,2MB) · event-photos(pub,5MB,+gif)
  · qr-codes(pub,100KB,png) · event-documents(priv,20MB,office) · speaker-handouts(priv,20MB,ppt)
Leave AS-IS (config is better-tuned than the proposed migration — matches app SIZE_MAP). No creation,
no RLS change needed. IMAGE DEPENDENCY IS RESOLVED — dataset can store Drive logos + generated
headshots immediately. The file-uploads "blocked on missing bucket" note elsewhere is also stale;
upload API routes (/api/upload, /upload/avatar, /photo-upload, /upload/community-image) exist.
LESSON: verify against storage.buckets directly, not the ledger. (Caught by verify-after-write.)

--------------------------------------------------------------------------------
## RELOAD & RESTORE STRATEGY (2026-05-30)
Two ways to get back to known-good; build both.
- CANONICAL = re-seed. Source of truth = scripts/seed/ + data/ in git. `wipe → seed --all --execute`
  rebuilds deterministically. Survives schema/code changes (re-run after a migration). Slower.
- FAST = snapshot restore. A pg_dump of the known-good state restores in seconds, byte-for-byte.
  Stored dated on the Mac (~/Prezva/backups/, gitignored) + Supabase auto-backup/PITR (plan-dependent;
  the pg_dump is the reliable plan-independent path). Use for quick resets between test runs.
Convenience npm scripts: seed:reset (wipe+all+execute), seed:snapshot, seed:restore <file>, seed:dry.
Idempotency rules that keep reloads clean (no accumulation / no inbox spam):
- Stripe: stamp test connected accounts metadata {seed:'golden'}; reset reuses-by-metadata or
  deletes-then-recreates — never accumulate orphan acct_ ids.
- Auth/invites: personas upsert by email; invite emails fire only on first creation (or under a flag),
  NOT every reload. Option: preserve hero auth users across wipe (like sowu.paul) so logins/passwords
  persist and no re-invite is sent.
- Images: storage buckets are NOT truncated by the DB wipe (separate from Postgres) → images persist;
  seed uploads idempotently by path and skips what already exists. Reloads do not re-upload.
Rule of thumb: FAST restore for everyday reset-and-retest; CANONICAL re-seed after schema changes or
to prove regenerability.

--------------------------------------------------------------------------------
## PRE-WORK VERIFIED FACTS (2026-05-30, confirmed via Supabase MCP)
- auth.users has TWO AFTER INSERT triggers:
  1. trg_on_auth_user_created -> handle_new_user(): inserts profiles(id,email,full_name,avatar_url);
     full_name = raw_user_meta_data->>'full_name' or email prefix; avatar_url from metadata.
     => For NEW personas: create auth user (set user_metadata.full_name/avatar_url) -> trigger makes
        the profile -> seed UPSERTs to enrich. For sowu.paul (pre-existing auth row, profile wiped):
        trigger does NOT re-fire, so seed must UPSERT his profile supplying id+email+full_name itself.
        => Stage 1 upserts profiles keyed by id for everyone; never assume the row pre-exists.
  2. trg_link_anon_regs -> link_anonymous_registrations(): on new auth user, UPDATEs
     registrations.user_id = new.id WHERE attendee_email = new.email AND user_id IS NULL.
     => Personas (stage 1) run before registrations (stage 5), so a full reseed is naturally safe.
        STAGE 5 DESIGN NOTE: deliberately choose which guest emails collide with logged-in personas
        (models "guest who later created an account") vs stay distinct.
- profiles NOT NULL no-default columns = id, email ONLY. All else nullable/defaulted
  (timezone default America/Chicago, notification_email/push default true, created/updated_at now()).
- Runner: pnpm exec tsx --env-file=.env.local scripts/seed/run.ts ; data files = JSON (js-yaml absent).
- Env: SUPABASE_PROJECT_URL (fallback NEXT_PUBLIC_SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY.
- Root tsconfig excludes scripts/ AND tsx strips types without checking => seed code is type-checked
  ONLY by an explicit `tsc --noEmit -p scripts/seed/tsconfig.json` gate (add it).
