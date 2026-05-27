-- Create public bucket for hosting registration QR codes used in confirmation emails.
-- Gmail blocks data: URLs in <img src>, so QR codes must be served from a real URL.
-- Upload is service-role only (no INSERT policy needed — service role bypasses RLS).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('qr-codes', 'qr-codes', true, 102400, ARRAY['image/png'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
