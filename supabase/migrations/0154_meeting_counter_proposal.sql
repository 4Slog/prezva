-- O134: a meeting counter-proposal carries its own zone ({ at, tz }, R89) and an
-- optional note. 0059 declared these columns (counter_time as text) but was never
-- applied to prod, so every respond (accept / decline / counter) failed.
-- status gains the value 'countered' (status is free text; no CHECK to change).
ALTER TABLE public.meeting_requests ADD COLUMN IF NOT EXISTS meeting_counter_time jsonb;
ALTER TABLE public.meeting_requests ADD COLUMN IF NOT EXISTS meeting_counter_note text;
