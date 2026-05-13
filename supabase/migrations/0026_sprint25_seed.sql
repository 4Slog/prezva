-- Sprint 25 seed: trivia, passport locations, and sponsors for Birmingham SBW 2026

DO $$
DECLARE
  v_event_id uuid;
BEGIN
  SELECT id INTO v_event_id FROM events WHERE slug = 'birmingham-sbw-2026';
  IF v_event_id IS NULL THEN
    RAISE NOTICE 'birmingham-sbw-2026 not found — skipping Sprint 25 seed';
    RETURN;
  END IF;

  -- Trivia questions
  INSERT INTO trivia_questions (event_id, body, options, correct_index, points, sort_order)
  VALUES
    (v_event_id,
     'What city is known as "The Magic City" in the American South?',
     '["Atlanta","Birmingham","Memphis","Nashville"]'::jsonb,
     1, 10, 1),
    (v_event_id,
     'What percentage of small businesses fail within the first 5 years?',
     '["25%","33%","50%","70%"]'::jsonb,
     2, 10, 2),
    (v_event_id,
     'Which document is typically the first step when starting a new business?',
     '["Business plan","Articles of incorporation","Operating agreement","EIN application"]'::jsonb,
     0, 10, 3),
    (v_event_id,
     'What does "B2B" stand for in business?',
     '["Business to Buyer","Business to Business","Brand to Brand","Budget to Budget"]'::jsonb,
     1, 10, 4),
    (v_event_id,
     'Which type of business structure provides personal liability protection while allowing pass-through taxation?',
     '["Sole proprietorship","C-Corporation","LLC","General partnership"]'::jsonb,
     2, 15, 5),
    (v_event_id,
     'What is the primary purpose of a pitch deck?',
     '["Track expenses","Present your business to investors","Register your business","File taxes"]'::jsonb,
     1, 10, 6),
    (v_event_id,
     'Which social media platform has the highest B2B marketing effectiveness according to most studies?',
     '["Facebook","Instagram","LinkedIn","TikTok"]'::jsonb,
     2, 10, 7),
    (v_event_id,
     'What is "bootstrapping" in the startup world?',
     '["Getting a bank loan","Funding your business with personal savings","Raising venture capital","Taking on a co-founder"]'::jsonb,
     1, 10, 8)
  ON CONFLICT DO NOTHING;

  -- Passport locations (exhibitor hall stamps)
  INSERT INTO passport_locations (event_id, name, code, points)
  VALUES
    (v_event_id, 'Main Stage',           'STAGE',   10),
    (v_event_id, 'Networking Lounge',    'LOUNGE',  10),
    (v_event_id, 'Exhibitor Hall — A',   'EXHA',     5),
    (v_event_id, 'Exhibitor Hall — B',   'EXHB',     5),
    (v_event_id, 'Workshop Room 1',      'WS1',      5),
    (v_event_id, 'Workshop Room 2',      'WS2',      5),
    (v_event_id, 'Sponsor Row',          'SPONSOR',  5),
    (v_event_id, 'Registration Desk',   'REG',      5)
  ON CONFLICT (event_id, code) DO NOTHING;

  -- Demo sponsors
  INSERT INTO event_sponsors (event_id, name, website_url, tier, sort_order, is_featured)
  VALUES
    (v_event_id, 'Alabama Small Business Development Center',
     'https://asbdc.org', 'title', 1, true),
    (v_event_id, 'Regions Bank',
     'https://regions.com', 'gold', 1, false),
    (v_event_id, 'Birmingham Business Alliance',
     'https://birminghambusinessalliance.com', 'gold', 2, false),
    (v_event_id, 'Innovation Depot',
     'https://innovationdepot.org', 'silver', 1, false),
    (v_event_id, 'Prosper Birmingham',
     'https://prosperbirmingham.com', 'silver', 2, false),
    (v_event_id, 'Jones Walker LLP',
     'https://joneswalker.com', 'bronze', 1, false),
    (v_event_id, 'Protective Life',
     'https://protective.com', 'bronze', 2, false)
  ON CONFLICT DO NOTHING;
END $$;
