alter table public.audit_logs alter column action type text using action::text;
