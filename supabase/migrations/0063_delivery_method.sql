ALTER TABLE ticket_types ADD COLUMN IF NOT EXISTS delivery_method text
  NOT NULL DEFAULT 'in_person'
  CHECK (delivery_method IN ('in_person','virtual','both'));
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS delivery_method text
  NOT NULL DEFAULT 'in_person'
  CHECK (delivery_method IN ('in_person','virtual'));
