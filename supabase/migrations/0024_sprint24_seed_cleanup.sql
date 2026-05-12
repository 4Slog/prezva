-- Sprint 24 seed cleanup: fix Birmingham SBW timestamps, remove test data

-- Fix event start/end times for Birmingham SBW (seed used NOW() so both times were identical)
UPDATE events
SET
  start_at = '2026-06-09 08:00:00-05',
  end_at   = '2026-06-10 18:00:00-05'
WHERE slug = 'birmingham-sbw-2026';

-- Fix session times — seed created them all at the same moment (server time)
-- Assign realistic times spanning two days (Central time = UTC-5 in June)
UPDATE sessions
SET starts_at = '2026-06-09 09:00:00-05',
    ends_at   = '2026-06-09 10:00:00-05'
WHERE event_id = (SELECT id FROM events WHERE slug = 'birmingham-sbw-2026')
  AND title ILIKE '%opening%'
  OR (event_id = (SELECT id FROM events WHERE slug = 'birmingham-sbw-2026')
      AND starts_at::date = ends_at::date
      AND ROW_NUMBER() OVER (ORDER BY created_at) = 1);

-- Simpler approach: update all sessions for the event with staggered times
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS rn
  FROM sessions
  WHERE event_id = (SELECT id FROM events WHERE slug = 'birmingham-sbw-2026')
)
UPDATE sessions s
SET
  starts_at = CASE o.rn
    WHEN 1 THEN '2026-06-09 09:00:00-05'
    WHEN 2 THEN '2026-06-09 10:30:00-05'
    WHEN 3 THEN '2026-06-09 12:00:00-05'
    WHEN 4 THEN '2026-06-09 14:00:00-05'
    WHEN 5 THEN '2026-06-10 09:00:00-05'
    WHEN 6 THEN '2026-06-10 10:30:00-05'
    WHEN 7 THEN '2026-06-10 12:00:00-05'
    WHEN 8 THEN '2026-06-10 14:00:00-05'
    ELSE '2026-06-10 15:30:00-05'
  END,
  ends_at = CASE o.rn
    WHEN 1 THEN '2026-06-09 10:00:00-05'
    WHEN 2 THEN '2026-06-09 11:30:00-05'
    WHEN 3 THEN '2026-06-09 13:00:00-05'
    WHEN 4 THEN '2026-06-09 15:30:00-05'
    WHEN 5 THEN '2026-06-10 10:00:00-05'
    WHEN 6 THEN '2026-06-10 11:30:00-05'
    WHEN 7 THEN '2026-06-10 13:00:00-05'
    WHEN 8 THEN '2026-06-10 15:30:00-05'
    ELSE '2026-06-10 17:00:00-05'
  END
FROM ordered o
WHERE s.id = o.id;

-- Remove test surveys (short/nonsense titles created during development)
DELETE FROM surveys
WHERE title IN ('ed', 'dedf', 'test', 'Test', 'asdf')
  AND event_id = (SELECT id FROM events WHERE slug = 'birmingham-sbw-2026');

-- Remove draft announcements with no recipients that are clearly test data
DELETE FROM announcements
WHERE status = 'draft'
  AND recipient_count = 0
  AND title IN ('ed', 'dedf', 'test', 'Test', 'asdf', 'Draft')
  AND event_id = (SELECT id FROM events WHERE slug = 'birmingham-sbw-2026');
