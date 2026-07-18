-- Per-registration bearer token for the I10 cross-device one-tap sign-in link (GE-6).
ALTER TABLE registrations
  ADD COLUMN IF NOT EXISTS app_access_token text UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex');

UPDATE registrations
  SET app_access_token = encode(gen_random_bytes(16), 'hex')
  WHERE app_access_token IS NULL;
