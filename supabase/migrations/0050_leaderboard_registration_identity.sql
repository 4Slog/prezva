-- B9-29: Add registration_id to leaderboard_points for no-account attendees
-- user_id remains required for connected accounts; registration_id allows guest scoring

ALTER TABLE public.leaderboard_points
  ADD COLUMN IF NOT EXISTS registration_id uuid REFERENCES public.registrations(id) ON DELETE CASCADE;

-- Allow user_id to be null (guest attendees score by registration only)
ALTER TABLE public.leaderboard_points ALTER COLUMN user_id DROP NOT NULL;

-- Add partial unique index for reg-based scoring (user_id is null for guests)
CREATE UNIQUE INDEX IF NOT EXISTS leaderboard_points_reg_action_idx
  ON public.leaderboard_points(event_id, registration_id, action)
  WHERE registration_id IS NOT NULL AND user_id IS NULL;

-- RLS: guests can read their own points via registration_id
CREATE POLICY IF NOT EXISTS "leaderboard_points_select_reg"
  ON public.leaderboard_points FOR SELECT
  USING (true);
