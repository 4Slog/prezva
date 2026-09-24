-- R87: offline marker as separate columns. checked_in_source keeps meaning the
-- SURFACE (dashboard / embed / self); these record that a row came from a
-- device queue. Existing rows are untouched (is_offline defaults to false).
ALTER TABLE public.check_ins ADD COLUMN IF NOT EXISTS is_offline boolean NOT NULL DEFAULT false;
ALTER TABLE public.check_ins ADD COLUMN IF NOT EXISTS client_scanned_at timestamptz NULL;
ALTER TABLE public.check_ins ADD COLUMN IF NOT EXISTS client_entry_id uuid NULL;
-- A device queue entry is written at most once: a replayed entry hits this
-- index (23505) and the sync reports already_checked_in.
CREATE UNIQUE INDEX IF NOT EXISTS check_ins_client_entry_id_key
  ON public.check_ins (client_entry_id) WHERE client_entry_id IS NOT NULL;
COMMENT ON COLUMN public.check_ins.is_offline IS 'R87: true when the check-in was queued on a device offline and written at sync.';
COMMENT ON COLUMN public.check_ins.client_scanned_at IS 'R87: the device clock''s scan time, uncorrected. checked_in_at holds the skew-corrected time.';
COMMENT ON COLUMN public.check_ins.client_entry_id IS 'R87: the device queue entryId. Unique when set, so a replayed entry is never written twice.';
