-- Run this in Supabase SQL editor to create required storage buckets
-- Navigate to Supabase dashboard > SQL editor and paste this
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
  ('event-photos',     'event-photos',     true,  10485760, ARRAY['image/jpeg','image/png','image/webp']),
  ('org-assets',       'org-assets',       false, 10485760, ARRAY['image/jpeg','image/png','image/webp','image/svg+xml']),
  ('event-assets',     'event-assets',     false, 10485760, ARRAY['image/jpeg','image/png','image/webp','image/svg+xml']),
  ('speaker-handouts', 'speaker-handouts', false, 52428800, ARRAY['application/pdf','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation']),
  ('user-avatars',     'user-avatars',     false, 10485760, ARRAY['image/jpeg','image/png','image/webp']),
  ('event-documents',  'event-documents',  false, 52428800, ARRAY['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
ON CONFLICT (id) DO NOTHING;
