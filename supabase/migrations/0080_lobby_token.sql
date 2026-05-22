ALTER TABLE events ADD COLUMN IF NOT EXISTS lobby_token uuid DEFAULT gen_random_uuid();
UPDATE events SET lobby_token = gen_random_uuid() WHERE lobby_token IS NULL;
