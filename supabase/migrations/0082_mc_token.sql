ALTER TABLE events ADD COLUMN IF NOT EXISTS mc_token uuid DEFAULT gen_random_uuid();
UPDATE events SET mc_token = gen_random_uuid() WHERE mc_token IS NULL;
