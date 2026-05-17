ALTER TABLE public.event_sponsors
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS portal_access_token text UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS materials jsonb DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_event_sponsors_portal_token ON event_sponsors(portal_access_token);

UPDATE public.event_sponsors
SET slug = lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'))
WHERE slug IS NULL;
