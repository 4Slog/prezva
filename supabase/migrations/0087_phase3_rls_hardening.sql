-- Phase 3 security audit fix: P0-1 RLS hardening
--
-- 41 RLS policies were created with `qual = true` and the default `TO public`
-- role list, despite policy names indicating intent ("service_role_all",
-- "*_service_only", "system inserts/updates"). Combined this allowed any anon
-- caller to read, write, or delete every row in tables containing PII,
-- bearer tokens, and financial-gating records.
--
-- This migration:
--   1. Drops + recreates each broken policy as `TO service_role` (idempotent).
--   2. Adds proper user-scoped policies for attendee engagement tables so
--      legitimate code paths keep working without the open hole.
--
-- Re-running this migration is safe (DROP IF EXISTS + CREATE).

BEGIN;

-- ============================================================================
-- PART 1 — Lock to service_role only
-- These tables have no legitimate user-context access in app code; reads/
-- writes go through `createAdminClient()`.
-- ============================================================================

DROP POLICY IF EXISTS "service_role_all" ON public.abandoned_carts;
CREATE POLICY "service_role_all" ON public.abandoned_carts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_all" ON public.add_on_sessions;
CREATE POLICY "service_role_all" ON public.add_on_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_all" ON public.add_ons;
CREATE POLICY "service_role_all" ON public.add_ons
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_all" ON public.event_documents;
CREATE POLICY "service_role_all" ON public.event_documents
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_all" ON public.event_folders;
CREATE POLICY "service_role_all" ON public.event_folders
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "event_templates_service_only" ON public.event_templates;
CREATE POLICY "event_templates_service_only" ON public.event_templates
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_all" ON public.event_waivers;
CREATE POLICY "service_role_all" ON public.event_waivers
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_all" ON public.form_fields;
CREATE POLICY "service_role_all" ON public.form_fields
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_all" ON public.group_tickets;
CREATE POLICY "service_role_all" ON public.group_tickets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "leaderboard_points_service_only" ON public.leaderboard_points;
CREATE POLICY "leaderboard_points_service_only" ON public.leaderboard_points
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_all" ON public.registration_add_ons;
CREATE POLICY "service_role_all" ON public.registration_add_ons
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_all" ON public.registration_field_responses;
CREATE POLICY "service_role_all" ON public.registration_field_responses
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_all" ON public.session_documents;
CREATE POLICY "service_role_all" ON public.session_documents
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_all" ON public.session_messages;
CREATE POLICY "service_role_all" ON public.session_messages
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_all" ON public.session_ticket_access;
CREATE POLICY "service_role_all" ON public.session_ticket_access
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "speaker_conversations_service_only" ON public.speaker_conversations;
CREATE POLICY "speaker_conversations_service_only" ON public.speaker_conversations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "speaker_form_submissions_service_only" ON public.speaker_form_submissions;
CREATE POLICY "speaker_form_submissions_service_only" ON public.speaker_form_submissions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "speaker_messages_service_only" ON public.speaker_messages;
CREATE POLICY "speaker_messages_service_only" ON public.speaker_messages
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "speaker_tokens_service_only" ON public.speaker_tokens;
CREATE POLICY "speaker_tokens_service_only" ON public.speaker_tokens
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "sponsor_contacts_service_all" ON public.sponsor_contacts;
CREATE POLICY "sponsor_contacts_service_all" ON public.sponsor_contacts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "sponsor_leads_service_all" ON public.sponsor_leads;
CREATE POLICY "sponsor_leads_service_all" ON public.sponsor_leads
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_all" ON public.ticket_invite_allowlist;
CREATE POLICY "service_role_all" ON public.ticket_invite_allowlist
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_all" ON public.venue_maps;
CREATE POLICY "service_role_all" ON public.venue_maps
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_all" ON public.waiver_signatures;
CREATE POLICY "service_role_all" ON public.waiver_signatures
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Issued certificates: only the system-managed write policies were broken.
-- The existing "attendee reads own certificate" and "org staff reads event
-- certificates" policies are correct and remain untouched.
DROP POLICY IF EXISTS "system inserts certificates" ON public.issued_certificates;
CREATE POLICY "system inserts certificates" ON public.issued_certificates
  FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "system updates certificates" ON public.issued_certificates;
CREATE POLICY "system updates certificates" ON public.issued_certificates
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- Template tables: public read policies preserved separately; only the write
-- policies were broken.
DROP POLICY IF EXISTS "poll_templates_service_write" ON public.poll_templates;
CREATE POLICY "poll_templates_service_write" ON public.poll_templates
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "survey_templates_service_write" ON public.survey_templates;
CREATE POLICY "survey_templates_service_write" ON public.survey_templates
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- PART 2 — Service-role baseline + user/staff scoped policies
-- These tables have legitimate attendee or org-staff access. The broken policy
-- is locked to service_role; user-context access is granted via explicit
-- ownership / membership predicates in PART 3.
-- ============================================================================

DROP POLICY IF EXISTS "poll_votes_service_only" ON public.poll_votes;
CREATE POLICY "poll_votes_service_only" ON public.poll_votes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "session_feedback_service_only" ON public.session_feedback;
CREATE POLICY "session_feedback_service_only" ON public.session_feedback
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "trivia_answers_service_only" ON public.trivia_answers;
CREATE POLICY "trivia_answers_service_only" ON public.trivia_answers
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_all" ON public.session_notes;
CREATE POLICY "service_role_all" ON public.session_notes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_all" ON public.session_question_upvotes;
CREATE POLICY "service_role_all" ON public.session_question_upvotes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "session_handouts_service_only" ON public.session_handouts;
CREATE POLICY "session_handouts_service_only" ON public.session_handouts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- session_questions had two duplicate broken policies — collapse to one.
DROP POLICY IF EXISTS "service_role_all" ON public.session_questions;
DROP POLICY IF EXISTS "session_questions_service_only" ON public.session_questions;
CREATE POLICY "session_questions_service_only" ON public.session_questions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "trivia_questions_service_only" ON public.trivia_questions;
CREATE POLICY "trivia_questions_service_only" ON public.trivia_questions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "icebreaker_completions_service_only" ON public.icebreaker_completions;
CREATE POLICY "icebreaker_completions_service_only" ON public.icebreaker_completions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "photo_contest_service_only" ON public.photo_contest_entries;
CREATE POLICY "photo_contest_service_only" ON public.photo_contest_entries
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "photo_contest_votes_service_only" ON public.photo_contest_votes;
CREATE POLICY "photo_contest_votes_service_only" ON public.photo_contest_votes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- PART 3 — User-scoped attendee/staff policies
-- ============================================================================

-- poll_votes: attendee manages their own vote
DROP POLICY IF EXISTS "poll_votes_own_select" ON public.poll_votes;
CREATE POLICY "poll_votes_own_select" ON public.poll_votes
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "poll_votes_own_insert" ON public.poll_votes;
CREATE POLICY "poll_votes_own_insert" ON public.poll_votes
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "poll_votes_own_update" ON public.poll_votes;
CREATE POLICY "poll_votes_own_update" ON public.poll_votes
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "poll_votes_own_delete" ON public.poll_votes;
CREATE POLICY "poll_votes_own_delete" ON public.poll_votes
  FOR DELETE USING (auth.uid() = user_id);

-- session_feedback: attendee owns their feedback; org staff can read
DROP POLICY IF EXISTS "session_feedback_own_all" ON public.session_feedback;
CREATE POLICY "session_feedback_own_all" ON public.session_feedback
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "session_feedback_staff_select" ON public.session_feedback;
CREATE POLICY "session_feedback_staff_select" ON public.session_feedback
  FOR SELECT USING (has_org_role(event_org_id(event_id), 'staff'::org_role));

-- trivia_answers: attendee owns their answers
DROP POLICY IF EXISTS "trivia_answers_own_all" ON public.trivia_answers;
CREATE POLICY "trivia_answers_own_all" ON public.trivia_answers
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- session_notes: user's private notes
DROP POLICY IF EXISTS "session_notes_own_all" ON public.session_notes;
CREATE POLICY "session_notes_own_all" ON public.session_notes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- session_question_upvotes: attendee owns their upvote; public read for counts
DROP POLICY IF EXISTS "session_question_upvotes_own_write" ON public.session_question_upvotes;
CREATE POLICY "session_question_upvotes_own_write" ON public.session_question_upvotes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "session_question_upvotes_read_public" ON public.session_question_upvotes;
CREATE POLICY "session_question_upvotes_read_public" ON public.session_question_upvotes
  FOR SELECT USING (true);

-- icebreaker_completions: attendee owns their completion
DROP POLICY IF EXISTS "icebreaker_completions_own_all" ON public.icebreaker_completions;
CREATE POLICY "icebreaker_completions_own_all" ON public.icebreaker_completions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- photo_contest_entries: attendee owns their entry; public read for display
DROP POLICY IF EXISTS "photo_contest_entries_own_write" ON public.photo_contest_entries;
CREATE POLICY "photo_contest_entries_own_write" ON public.photo_contest_entries
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "photo_contest_entries_read_public" ON public.photo_contest_entries;
CREATE POLICY "photo_contest_entries_read_public" ON public.photo_contest_entries
  FOR SELECT USING (true);

-- photo_contest_votes: attendee owns their vote; public read for counts
DROP POLICY IF EXISTS "photo_contest_votes_own_write" ON public.photo_contest_votes;
CREATE POLICY "photo_contest_votes_own_write" ON public.photo_contest_votes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "photo_contest_votes_read_public" ON public.photo_contest_votes;
CREATE POLICY "photo_contest_votes_read_public" ON public.photo_contest_votes
  FOR SELECT USING (true);

-- session_handouts: registered attendees and org staff can read
DROP POLICY IF EXISTS "session_handouts_read_attendees_staff" ON public.session_handouts;
CREATE POLICY "session_handouts_read_attendees_staff" ON public.session_handouts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = session_handouts.session_id
        AND (
          is_registered(s.event_id)
          OR has_org_role(event_org_id(s.event_id), 'staff'::org_role)
        )
    )
  );

-- session_questions: registered attendees and org staff
DROP POLICY IF EXISTS "session_questions_attendee_select" ON public.session_questions;
CREATE POLICY "session_questions_attendee_select" ON public.session_questions
  FOR SELECT USING (
    is_registered(event_id)
    OR has_org_role(event_org_id(event_id), 'staff'::org_role)
  );
DROP POLICY IF EXISTS "session_questions_attendee_insert" ON public.session_questions;
CREATE POLICY "session_questions_attendee_insert" ON public.session_questions
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND (
      is_registered(event_id)
      OR has_org_role(event_org_id(event_id), 'staff'::org_role)
    )
  );
DROP POLICY IF EXISTS "session_questions_owner_or_staff_update" ON public.session_questions;
CREATE POLICY "session_questions_owner_or_staff_update" ON public.session_questions
  FOR UPDATE USING (
    auth.uid() = user_id
    OR has_org_role(event_org_id(event_id), 'staff'::org_role)
  );
DROP POLICY IF EXISTS "session_questions_owner_or_staff_delete" ON public.session_questions;
CREATE POLICY "session_questions_owner_or_staff_delete" ON public.session_questions
  FOR DELETE USING (
    auth.uid() = user_id
    OR has_org_role(event_org_id(event_id), 'staff'::org_role)
  );

-- trivia_questions: registered attendees and org staff can read
DROP POLICY IF EXISTS "trivia_questions_attendee_select" ON public.trivia_questions;
CREATE POLICY "trivia_questions_attendee_select" ON public.trivia_questions
  FOR SELECT USING (
    is_registered(event_id)
    OR has_org_role(event_org_id(event_id), 'staff'::org_role)
  );

COMMIT;
