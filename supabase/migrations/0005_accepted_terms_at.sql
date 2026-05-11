-- Add accepted_terms_at to profiles for T&C acceptance tracking
alter table public.profiles
  add column if not exists accepted_terms_at timestamptz;
