-- Sprint 21: when a user creates an account, auto-link any anonymous
-- registrations under the same email to their user_id
create or replace function public.link_anonymous_registrations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.registrations
  set user_id = new.id
  where attendee_email = new.email
    and user_id is null;
  return new;
end;
$$;

drop trigger if exists trg_link_anon_regs on auth.users;
create trigger trg_link_anon_regs
  after insert on auth.users
  for each row execute function public.link_anonymous_registrations();
