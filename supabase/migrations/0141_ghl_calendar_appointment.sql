-- Repo ledger only: applied live via Supabase MCP 2026-07-27 before this commit.
-- calendar_id: the org's GHL "Prezva Events" calendar (nullable — rides the snapshot
-- pre-configured because notification config is UI-only; provisioner adopts by name,
-- never creates). ghl_appointment_id: the appointment created per registration,
-- stored beside ghl_opportunity_id for future refund-cancel.
alter table public.ghl_org_config add column if not exists calendar_id text;
alter table public.ghl_sync_state add column if not exists ghl_appointment_id text;
