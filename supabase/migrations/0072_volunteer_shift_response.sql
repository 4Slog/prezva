ALTER TABLE volunteers ADD COLUMN IF NOT EXISTS shift_response text
  CHECK (shift_response IN ('confirmed','declined','pending')) DEFAULT 'pending';
ALTER TABLE volunteers ADD COLUMN IF NOT EXISTS shift_response_at timestamptz;
ALTER TABLE volunteers ADD COLUMN IF NOT EXISTS shift_decline_reason text;
