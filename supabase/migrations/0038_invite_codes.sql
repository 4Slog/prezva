-- Invite codes for invite-only beta access
-- Only users with a valid unused invite code can sign up

CREATE TABLE IF NOT EXISTS public.invite_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE,
  email       text,                        -- if set, only this email can use it
  used_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  text,                        -- who generated it (for your records)
  note        text                         -- optional label e.g. "Civitas onboarding"
);

ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;

-- Only service role can read/write invite codes (no user-level access)
-- The signup API route uses adminClient to validate codes
CREATE POLICY "invite_codes_no_user_access" ON public.invite_codes
  FOR ALL USING (false);

-- Index for fast code lookups
CREATE INDEX invite_codes_code_idx ON public.invite_codes(code);
CREATE INDEX invite_codes_email_idx ON public.invite_codes(email) WHERE email IS NOT NULL;

-- Pre-approved emails get their own permanent codes
-- These never expire and are pre-seeded for Paul and his team
INSERT INTO public.invite_codes (code, email, created_by, note) VALUES
  ('PAUL-SOWU-2026',     'sowu.paul@gmail.com',   'system', 'Paul Sowu — primary account'),
  ('THSOWU-2026',        'thsowu@gmail.com',      'system', 'thsowu account'),
  ('THESOWUS-2026',      'thesowus@gmail.com',    'system', 'thesowus account'),
  ('DEMO-OWNER-2026',    'demo.owner@prezva-audit.test', 'system', 'Demo owner test account'),
  ('DEMO-ADMIN-2026',    'demo.admin@prezva-audit.test', 'system', 'Demo admin test account'),
  ('DEMO-ATTEND-2026',   'demo.attendee@prezva-audit.test', 'system', 'Demo attendee test account'),
  ('LINDA-CARTER-2026',  'linda@carter.test',     'system', 'Linda Carter test account'),
  ('PREZVA-BETA-001',    null, 'system', 'Open beta code — shareable'),
  ('PREZVA-BETA-002',    null, 'system', 'Open beta code — shareable'),
  ('PREZVA-BETA-003',    null, 'system', 'Open beta code — shareable'),
  ('PREZVA-BETA-004',    null, 'system', 'Open beta code — shareable'),
  ('PREZVA-BETA-005',    null, 'system', 'Open beta code — shareable'),
  ('CIVITAS-2026',       null, 'system', 'Civitas Consulting Group onboarding'),
  ('PREZVA-STAFF-01',    null, 'system', 'Staff/team access code')
ON CONFLICT (code) DO NOTHING;
