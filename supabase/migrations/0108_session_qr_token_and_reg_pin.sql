-- Migration 0108: session QR tokens + registration PINs

-- ── registrations.pin ──────────────────────────────────────────────────────────
-- 6-digit numeric PIN, scoped to email for self-check-in verification.
-- Global uniqueness is NOT required (email is the selector; pin is the verifier).
ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS pin text;

UPDATE public.registrations
  SET pin = lpad(((('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::int & 2147483647) % 1000000)::text, 6, '0')
  WHERE pin IS NULL;

ALTER TABLE public.registrations
  ALTER COLUMN pin SET NOT NULL,
  ALTER COLUMN pin SET DEFAULT lpad(((('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::int & 2147483647) % 1000000)::text, 6, '0');

-- ── sessions.session_qr_token ──────────────────────────────────────────────────
-- URL-safe hex token used to key the attendee session self-scan route.
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS session_qr_token text;

UPDATE public.sessions
  SET session_qr_token = encode(gen_random_bytes(16), 'hex')
  WHERE session_qr_token IS NULL;

ALTER TABLE public.sessions
  ALTER COLUMN session_qr_token SET NOT NULL,
  ALTER COLUMN session_qr_token SET DEFAULT encode(gen_random_bytes(16), 'hex'),
  ADD CONSTRAINT sessions_session_qr_token_key UNIQUE (session_qr_token);
