-- B2-7: Add deduplication constraint on leaderboard_points
-- Prevents the same user from earning points for the same action more than once per event
-- Note: this intentionally allows multiple photo_upload, community_post, qa_upvote awards
-- (those are genuinely repeatable). Only single-occurrence actions get constrained.
-- We use a partial unique index scoped to single-occurrence action types.

CREATE UNIQUE INDEX IF NOT EXISTS leaderboard_points_once_per_action_idx
  ON public.leaderboard_points(event_id, user_id, action)
  WHERE action IN ('checkin', 'profile_complete', 'session_attend');

-- For truly repeatable actions (trivia_correct, icebreaker, passport_visit, photo_upload,
-- community_post, qa_upvote) we do NOT add a unique constraint — multiple awards are correct.
