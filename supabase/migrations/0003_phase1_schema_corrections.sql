-- Migration: 0003_phase1_schema_corrections
-- Purpose: Drop audit-only columns that were added directly to prod during Phase 1 audit (May 10 2026).
--          These were never in any migration file. Code has been updated to not reference them.
-- Note: The `yes_no` value added to question_type enum is left in place — Postgres cannot drop enum values.

-- Drop audit-only generated column on ticket_types
ALTER TABLE public.ticket_types
  DROP COLUMN IF EXISTS ticket_type;

-- Drop audit-only column on org_members
ALTER TABLE public.org_members
  DROP COLUMN IF EXISTS accepted_at;

-- Drop audit-only column on survey_questions
ALTER TABLE public.survey_questions
  DROP COLUMN IF EXISTS required;

-- Drop audit-only column on session_bookmarks
ALTER TABLE public.session_bookmarks
  DROP COLUMN IF EXISTS event_id;
