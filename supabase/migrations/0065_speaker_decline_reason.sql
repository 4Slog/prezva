ALTER TABLE speakers ADD COLUMN IF NOT EXISTS decline_reason text;
ALTER TABLE speakers ADD COLUMN IF NOT EXISTS decline_alternative text;
