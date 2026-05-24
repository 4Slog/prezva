-- Run this in Supabase SQL editor to create required storage buckets
-- Navigate to Supabase dashboard > SQL editor and paste this
INSERT INTO storage.buckets (id, name, public) VALUES
  ('org-logos', 'org-logos', true),
  ('speaker-photos', 'speaker-photos', true),
  ('handouts', 'handouts', false),
  ('badges', 'badges', false),
  ('certificates', 'certificates', false),
  ('event-covers', 'event-covers', true),
  ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;
