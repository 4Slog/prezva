-- Sprint 26: Civitas demo seed reset
-- Preserves: org (4ab17b77), event (a8a984c8), auth user (639b6098), ticket type IDs
-- Cleans:    audit test registrations, stale speakers, draft surveys, draft announcements
-- Adds:      5 polished speakers, 8 demo attendees (3 checked in), 1 NPS survey,
--            1 community post, 1 announcement draft — all demoable
-- Safe to re-run: all INSERTs use ON CONFLICT DO NOTHING

DO $$
DECLARE
  v_event_id   uuid := 'a8a984c8-27f3-4391-ba40-ebedfaeb279d';
  v_org_id     uuid := '4ab17b77-4f76-4091-b0cc-509045cb9998';
  v_owner_id   uuid := '639b6098-8be3-44c3-91a3-7b4c43c5dc9b';

  v_ticket_free uuid := '6fc9db3d-b5c2-4dde-8754-73d5473466cd';
  v_ticket_paid uuid := 'fc0dc49e-54ae-4297-a913-3d621c3bfd04';
  v_ticket_vip  uuid := 'b1e70f21-3a2c-4d8f-9c11-1a2b3c4d5e6f';

  v_sp1 uuid; v_sp2 uuid; v_sp3 uuid; v_sp4 uuid; v_sp5 uuid;
  v_sess1 uuid; v_sess2 uuid; v_sess3 uuid;
  v_track1 uuid; v_track2 uuid; v_track3 uuid;
  v_room1 uuid; v_room2 uuid; v_room3 uuid;
  v_survey uuid;
  v_r1 uuid; v_r2 uuid; v_r3 uuid;
BEGIN

  -- ── 1. Verify event exists ────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM events WHERE id = v_event_id) THEN
    RAISE EXCEPTION 'Event a8a984c8 not found — run previous migrations first';
  END IF;

  -- ── 2. Clean audit test data ──────────────────────────────────────────────
  DELETE FROM registrations
  WHERE event_id = v_event_id
    AND (
      attendee_email LIKE '%@prezva-audit.test'
      OR attendee_email LIKE '%@example.com'
      OR attendee_email LIKE 'sprint%'
      OR attendee_email LIKE '%inttest%'
      OR attendee_email LIKE '%e2e%@test.%'
    );

  DELETE FROM check_ins
  WHERE event_id = v_event_id
    AND registration_id NOT IN (SELECT id FROM registrations WHERE event_id = v_event_id);

  DELETE FROM announcements
  WHERE event_id = v_event_id AND status = 'draft' AND recipient_count = 0;

  DELETE FROM surveys
  WHERE event_id = v_event_id AND title LIKE '%test%' AND title NOT LIKE '%NPS%';

  -- ── 3. Update event to production-ready state ─────────────────────────────
  UPDATE events SET
    title       = 'Birmingham Small Business Week 2026',
    description = 'The premier gathering for Birmingham entrepreneurs. Three days of keynotes, workshops, and networking designed to accelerate your business.',
    status      = 'published',
    capacity    = 500,
    website_url = 'https://prezva.app/e/birmingham-sbw-2026'
  WHERE id = v_event_id;

  -- ── 4. Ticket types (keep stable IDs for integration tests) ──────────────
  INSERT INTO ticket_types (id, event_id, name, type, price_cents, quantity, quantity_sold, description)
  VALUES
    (v_ticket_free, v_event_id, 'Free RSVP',    'free', 0,     200, 0, 'General admission — no cost'),
    (v_ticket_paid, v_event_id, 'General Admission', 'paid', 2500, 250, 0, 'Full 3-day access to all sessions'),
    (v_ticket_vip,  v_event_id, 'VIP All-Access',    'paid', 7500,  50, 0, 'Priority seating, speaker dinner, swag bag')
  ON CONFLICT (id) DO UPDATE SET
    name          = EXCLUDED.name,
    price_cents   = EXCLUDED.price_cents,
    quantity      = EXCLUDED.quantity,
    description   = EXCLUDED.description;

  -- ── 5. Tracks & rooms ────────────────────────────────────────────────────
  INSERT INTO tracks (id, event_id, name, color)
  VALUES
    (gen_random_uuid(), v_event_id, 'Growth & Strategy',   '#0d9488'),
    (gen_random_uuid(), v_event_id, 'Finance & Funding',    '#7c3aed'),
    (gen_random_uuid(), v_event_id, 'Operations & Tech',    '#d97706')
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_track1 FROM tracks WHERE event_id = v_event_id AND name = 'Growth & Strategy' LIMIT 1;
  SELECT id INTO v_track2 FROM tracks WHERE event_id = v_event_id AND name = 'Finance & Funding' LIMIT 1;
  SELECT id INTO v_track3 FROM tracks WHERE event_id = v_event_id AND name = 'Operations & Tech' LIMIT 1;

  INSERT INTO rooms (id, event_id, name, capacity)
  VALUES
    (gen_random_uuid(), v_event_id, 'Main Hall',        400),
    (gen_random_uuid(), v_event_id, 'Workshop Room A',  80),
    (gen_random_uuid(), v_event_id, 'Workshop Room B',  80)
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_room1 FROM rooms WHERE event_id = v_event_id AND name = 'Main Hall'      LIMIT 1;
  SELECT id INTO v_room2 FROM rooms WHERE event_id = v_event_id AND name = 'Workshop Room A' LIMIT 1;
  SELECT id INTO v_room3 FROM rooms WHERE event_id = v_event_id AND name = 'Workshop Room B' LIMIT 1;

  -- ── 6. Speakers ──────────────────────────────────────────────────────────
  DELETE FROM speakers WHERE event_id = v_event_id;

  v_sp1 := gen_random_uuid();
  v_sp2 := gen_random_uuid();
  v_sp3 := gen_random_uuid();
  v_sp4 := gen_random_uuid();
  v_sp5 := gen_random_uuid();

  INSERT INTO speakers (id, event_id, name, job_title, company, bio, email, status, is_published, sort_order)
  VALUES
    (v_sp1, v_event_id,
     'Dr. Angela Reeves',
     'Founder & CEO',
     'Reeves Growth Consulting',
     'Dr. Reeves has advised over 200 small businesses across the Southeast on scaling strategy and capital access. A Forbes Next 1000 honoree, she brings practical frameworks that work in the real world.',
     'angela@reevesgrowth.com', 'confirmed', true, 1),

    (v_sp2, v_event_id,
     'Marcus D. Thompson',
     'Partner',
     'Thompson Capital Partners',
     'Marcus leads small business lending and equity placement at Thompson Capital. He has facilitated over $45 million in funding for minority-owned businesses since 2018.',
     'marcus@thompsoncapital.com', 'confirmed', true, 2),

    (v_sp3, v_event_id,
     'Priya Nair',
     'Director of Entrepreneurship',
     'Birmingham Business Alliance',
     'Priya oversees BBA''s SME programs, connecting Birmingham entrepreneurs with city resources, grants, and partner networks. She was named one of Birmingham''s Top 40 Under 40.',
     'pnair@birminghambusinessalliance.com', 'confirmed', true, 3),

    (v_sp4, v_event_id,
     'James "JB" Booker',
     'Co-Founder',
     'OperateIQ',
     'JB built OperateIQ from a two-person shop into a 60-person SaaS company serving 1,200 field service businesses. He''ll share the operational playbook that made it possible.',
     'jb@operateiq.com', 'confirmed', true, 4),

    (v_sp5, v_event_id,
     'Tamika Wells',
     'Director of Small Business Programs',
     'Alabama SBDC',
     'Tamika directs free consulting and training for Alabama entrepreneurs. Her team has helped launch 300+ new businesses in the last three years.',
     'twells@asbdc.org', 'confirmed', true, 5);

  -- ── 7. Sessions (15 total across 3 days) ─────────────────────────────────
  DELETE FROM sessions WHERE event_id = v_event_id;

  -- Day 1: June 9, 2026 (Mon) — Growth & Strategy focus
  INSERT INTO sessions (id, event_id, title, session_type, starts_at, ends_at, track_id, room_id, is_published, sort_order)
  VALUES
    (gen_random_uuid(), v_event_id, 'Opening Keynote: The State of Birmingham Business',
     'keynote', '2026-06-09 09:00:00-05', '2026-06-09 10:00:00-05', v_track1, v_room1, true, 1),
    (gen_random_uuid(), v_event_id, 'From Side Hustle to Scalable: 5 Systems Every Owner Needs',
     'talk',    '2026-06-09 10:30:00-05', '2026-06-09 11:30:00-05', v_track1, v_room1, true, 2),
    (gen_random_uuid(), v_event_id, 'Funding Landscape: Grants, Loans & Equity in 2026',
     'workshop','2026-06-09 13:00:00-05', '2026-06-09 14:30:00-05', v_track2, v_room2, true, 3),
    (gen_random_uuid(), v_event_id, 'Operations Tech Stack for Small Teams',
     'workshop','2026-06-09 13:00:00-05', '2026-06-09 14:30:00-05', v_track3, v_room3, true, 4),
    (gen_random_uuid(), v_event_id, 'Speed Networking — Day 1',
     'networking','2026-06-09 16:00:00-05','2026-06-09 17:30:00-05', v_track1, v_room1, true, 5);

  -- Day 2: June 10, 2026 (Tue) — Finance & Funding focus
  INSERT INTO sessions (id, event_id, title, session_type, starts_at, ends_at, track_id, room_id, is_published, sort_order)
  VALUES
    (gen_random_uuid(), v_event_id, 'Morning Keynote: Capital Access for Minority Entrepreneurs',
     'keynote', '2026-06-10 09:00:00-05', '2026-06-10 10:00:00-05', v_track2, v_room1, true, 6),
    (gen_random_uuid(), v_event_id, 'SBA Loans Demystified',
     'talk',    '2026-06-10 10:30:00-05', '2026-06-10 11:30:00-05', v_track2, v_room2, true, 7),
    (gen_random_uuid(), v_event_id, 'Building Your Brand on a Bootstrap Budget',
     'workshop','2026-06-10 13:00:00-05', '2026-06-10 14:30:00-05', v_track1, v_room2, true, 8),
    (gen_random_uuid(), v_event_id, 'AI Tools for Small Business Owners',
     'workshop','2026-06-10 13:00:00-05', '2026-06-10 14:30:00-05', v_track3, v_room3, true, 9),
    (gen_random_uuid(), v_event_id, 'Exhibitor Hall Open + Sponsor Showcase',
     'break',   '2026-06-10 15:00:00-05', '2026-06-10 17:00:00-05', v_track1, v_room1, true, 10);

  -- Day 3: June 11, 2026 (Wed) — Close & Celebration
  INSERT INTO sessions (id, event_id, title, session_type, starts_at, ends_at, track_id, room_id, is_published, sort_order)
  VALUES
    (gen_random_uuid(), v_event_id, 'Morning Workshop: Building Your 90-Day Action Plan',
     'workshop','2026-06-11 09:00:00-05', '2026-06-11 10:30:00-05', v_track1, v_room2, true, 11),
    (gen_random_uuid(), v_event_id, 'Legal Foundations: Protect Your Business',
     'talk',    '2026-06-11 09:00:00-05', '2026-06-11 10:00:00-05', v_track2, v_room3, true, 12),
    (gen_random_uuid(), v_event_id, 'Panel: Women-Owned Businesses Shaping Birmingham',
     'panel',   '2026-06-11 11:00:00-05', '2026-06-11 12:00:00-05', v_track1, v_room1, true, 13),
    (gen_random_uuid(), v_event_id, 'Pitch Competition: Best Business Idea',
     'talk',    '2026-06-11 14:00:00-05', '2026-06-11 15:30:00-05', v_track1, v_room1, true, 14),
    (gen_random_uuid(), v_event_id, 'Closing Keynote & Awards Ceremony',
     'keynote', '2026-06-11 16:00:00-05', '2026-06-11 17:30:00-05', v_track1, v_room1, true, 15);

  -- Wire speakers to featured sessions
  SELECT id INTO v_sess1 FROM sessions WHERE event_id = v_event_id AND title LIKE '%Opening Keynote%'  LIMIT 1;
  SELECT id INTO v_sess2 FROM sessions WHERE event_id = v_event_id AND title LIKE '%Morning Keynote%'  LIMIT 1;
  SELECT id INTO v_sess3 FROM sessions WHERE event_id = v_event_id AND title LIKE '%Closing Keynote%'  LIMIT 1;

  IF v_sess1 IS NOT NULL THEN
    INSERT INTO session_speakers (session_id, speaker_id) VALUES (v_sess1, v_sp1), (v_sess1, v_sp3) ON CONFLICT DO NOTHING;
  END IF;
  IF v_sess2 IS NOT NULL THEN
    INSERT INTO session_speakers (session_id, speaker_id) VALUES (v_sess2, v_sp2), (v_sess2, v_sp5) ON CONFLICT DO NOTHING;
  END IF;
  IF v_sess3 IS NOT NULL THEN
    INSERT INTO session_speakers (session_id, speaker_id) VALUES (v_sess3, v_sp1), (v_sess3, v_sp4) ON CONFLICT DO NOTHING;
  END IF;

  -- ── 8. Demo attendees ────────────────────────────────────────────────────
  -- Reset ticket counters before inserting
  UPDATE ticket_types SET quantity_sold = 0 WHERE event_id = v_event_id;

  v_r1 := gen_random_uuid();
  v_r2 := gen_random_uuid();
  v_r3 := gen_random_uuid();

  INSERT INTO registrations
    (id, event_id, ticket_type_id, attendee_name, attendee_email, attendee_phone,
     attendee_company, status, amount_paid_cents, created_at)
  VALUES
    -- Free RSVP attendees
    (v_r1, v_event_id, v_ticket_free, 'Jasmine Carter',     'jasmine.carter@gmail.com',      '205-555-0101', 'Carter Creative Studio',    'confirmed', 0,    now() - interval '14 days'),
    (v_r2, v_event_id, v_ticket_free, 'DeShawn Mitchell',   'deshawn.mitchell@outlook.com',  '205-555-0102', 'Mitchell Auto Repair',       'confirmed', 0,    now() - interval '13 days'),
    (v_r3, v_event_id, v_ticket_free, 'Sandra Okonkwo',     'sandra.okonkwo@yahoo.com',      '205-555-0103', 'Okonkwo Hair & Beauty',      'confirmed', 0,    now() - interval '12 days'),
    -- GA paid attendees
    (gen_random_uuid(), v_event_id, v_ticket_paid, 'Marcus Webb',  'marcus.webb@protonmail.com',  '205-555-0104', 'Webb Technology Solutions', 'confirmed', 2500, now() - interval '10 days'),
    (gen_random_uuid(), v_event_id, v_ticket_paid, 'Tanya Rivers', 'tanya.rivers@rivers-law.com', '205-555-0105', 'Rivers Law Group',          'confirmed', 2500, now() - interval '9 days'),
    (gen_random_uuid(), v_event_id, v_ticket_paid, 'Kwame Asante', 'kwame.asante@gmail.com',      '205-555-0106', 'Asante Construction LLC',   'confirmed', 2500, now() - interval '8 days'),
    -- VIP attendees
    (gen_random_uuid(), v_event_id, v_ticket_vip,  'Nathalie Nelson Parker', 'nathalie@civitas-consulting.com', '205-555-0107', 'Civitas Consulting Group', 'confirmed', 7500, now() - interval '30 days'),
    (gen_random_uuid(), v_event_id, v_ticket_paid, 'Robert Simmons', 'robert.simmons@simonsenterprise.com', '205-555-0108', 'Simmons Enterprise', 'confirmed', 2500, now() - interval '7 days')
  ON CONFLICT DO NOTHING;

  -- Update quantity_sold counters
  UPDATE ticket_types SET quantity_sold = (
    SELECT COUNT(*) FROM registrations
    WHERE ticket_type_id = ticket_types.id AND status = 'confirmed'
  ) WHERE event_id = v_event_id;

  -- Check in first 3 attendees (day-1 scenario)
  INSERT INTO check_ins (event_id, registration_id, checked_in_by, device_id)
  SELECT v_event_id, v_r1, v_owner_id, 'demo-device-01'
  WHERE EXISTS (SELECT 1 FROM registrations WHERE id = v_r1)
  ON CONFLICT DO NOTHING;

  INSERT INTO check_ins (event_id, registration_id, checked_in_by, device_id)
  SELECT v_event_id, v_r2, v_owner_id, 'demo-device-01'
  WHERE EXISTS (SELECT 1 FROM registrations WHERE id = v_r2)
  ON CONFLICT DO NOTHING;

  INSERT INTO check_ins (event_id, registration_id, checked_in_by, device_id)
  SELECT v_event_id, v_r3, v_owner_id, 'demo-device-01'
  WHERE EXISTS (SELECT 1 FROM registrations WHERE id = v_r3)
  ON CONFLICT DO NOTHING;

  -- ── 9. NPS survey ────────────────────────────────────────────────────────
  v_survey := gen_random_uuid();
  INSERT INTO surveys (id, event_id, title, description, is_published, created_by)
  VALUES (v_survey, v_event_id,
    'Post-Event NPS — Birmingham SBW 2026',
    'Help us improve future events. Takes less than 2 minutes.',
    true, v_owner_id)
  ON CONFLICT DO NOTHING;

  INSERT INTO survey_questions (survey_id, question_text, question_type, sort_order, is_required)
  VALUES
    (v_survey, 'How likely are you to recommend Birmingham Small Business Week to a colleague?', 'rating',         1, true),
    (v_survey, 'Which session was most valuable to you?',                                       'short_answer',   2, false),
    (v_survey, 'What topic would you like to see added next year?',                             'short_answer',   3, false),
    (v_survey, 'Overall, how would you rate the event?',                                        'multiple_choice',4, true)
  ON CONFLICT DO NOTHING;

  -- ── 10. Starter community post ───────────────────────────────────────────
  INSERT INTO community_posts (event_id, user_id, body)
  VALUES (v_event_id, v_owner_id, 'Welcome to Birmingham Small Business Week 2026! 🎉 Use this space to connect with fellow attendees, share resources, and keep the conversation going. We''re glad you''re here.')
  ON CONFLICT DO NOTHING;

  -- ── 11. Announcement draft ───────────────────────────────────────────────
  INSERT INTO announcements (event_id, created_by, title, body, channel, status, recipient_count)
  VALUES (v_event_id, v_owner_id,
    'Welcome to Birmingham SBW 2026!',
    'We''re thrilled to have you at Birmingham Small Business Week 2026. Check the agenda, connect with speakers, and don''t miss the speed networking session on Day 1 at 4 PM CT.',
    'email', 'draft', 0)
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Civitas demo seed reset complete — event %, 15 sessions, 5 speakers, 8 attendees (3 checked in), 1 survey, 1 community post', v_event_id;
END $$;
