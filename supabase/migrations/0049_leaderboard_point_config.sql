-- B8-9: Per-event configurable leaderboard point values
ALTER TABLE events ADD COLUMN IF NOT EXISTS leaderboard_point_config jsonb DEFAULT '{
  "checkin": 100,
  "session_attend": 50,
  "survey_complete": 75,
  "icebreaker": 25,
  "profile_complete": 50,
  "community_post": 20,
  "passport_visit": 40,
  "trivia_correct": 30
}';
