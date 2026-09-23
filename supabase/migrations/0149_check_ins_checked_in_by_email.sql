ALTER TABLE public.check_ins ADD COLUMN IF NOT EXISTS checked_in_by_email text;
COMMENT ON COLUMN public.check_ins.checked_in_by_email IS 'Staff email from the GHL embed SSO session (R81). Set for embedded session scans, manual marks and overrides. NULL on dashboard rows, which use checked_in_by.';
