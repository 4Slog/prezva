ALTER TABLE registrations ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'online' CHECK (payment_method IN ('online','cash','card','invoice','comp','other'));
