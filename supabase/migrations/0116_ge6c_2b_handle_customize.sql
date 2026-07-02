-- customization flag (existing rows default false via column default; all auto-generated = not customized)
alter table public.profiles add column handle_customized boolean not null default false;

-- reserved-word guard: make "reserved" a DB invariant for user-set handles too
create or replace function public.enforce_handle_not_reserved()
returns trigger language plpgsql security definer set search_path to 'public' as $fn$
begin
  if exists (select 1 from public.reserved_handles r where r.handle = lower(new.handle)) then
    raise exception 'handle % is reserved', new.handle using errcode = '23514';
  end if;
  return new;
end $fn$;

create trigger trg_enforce_handle_not_reserved
  before insert or update of handle on public.profiles
  for each row execute function public.enforce_handle_not_reserved();
