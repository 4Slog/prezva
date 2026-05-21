-- Migration: 0074_volunteer_debrief_survey
-- Purpose: Add audience column to surveys; make created_by nullable for system-created surveys.
ALTER TABLE public.surveys ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.surveys ADD COLUMN IF NOT EXISTS audience text DEFAULT 'attendees';
