ALTER TABLE registrations ADD COLUMN IF NOT EXISTS press_token uuid;
UPDATE registrations r
  SET press_token = gen_random_uuid()
  FROM ticket_types tt
  WHERE r.ticket_type_id = tt.id
  AND tt.is_press = true
  AND r.press_token IS NULL;
