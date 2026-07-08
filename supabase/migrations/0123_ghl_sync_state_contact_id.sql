alter table public.ghl_sync_state
  add column if not exists ghl_contact_id text;

update public.ghl_sync_state
   set ghl_contact_id = raw_payload->>'contact_id'
 where ghl_contact_id is null
   and raw_payload->>'contact_id' is not null;
