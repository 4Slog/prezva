alter table public.ghl_sync_state
  add column link_tag_fired_at timestamptz;

comment on column public.ghl_sync_state.link_tag_fired_at is
  'R56: one-shot claim for the prezva-link-ready tag fire. Set by an atomic
   conditional UPDATE in postRegistrationWriteback so exactly one transport fires
   the tag per order, even when the app webhook and the workflow webhook race.';
