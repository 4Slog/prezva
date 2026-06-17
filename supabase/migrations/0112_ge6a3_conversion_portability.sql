-- 0112: GE-6a.3 — guest→account profile portability + latent FK-ordering fix
-- registrations.user_id FKs to profiles(id), NOT DEFERRABLE. trg_link_anon_regs fired
-- before trg_on_auth_user_created, linking a registration to a not-yet-existent profiles
-- row -> FK violation -> signup rollback on first guest conversion. Rebind it to fire
-- AFTER profiles is created.
drop trigger if exists trg_link_anon_regs on auth.users;
create trigger trg_z_link_anon_regs
  after insert on auth.users
  for each row execute function public.link_anonymous_registrations();

create or replace function public.link_attendee_profile_on_reg_link()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_avatar text;
begin
  if new.user_id is not null and old.user_id is distinct from new.user_id then
    update public.attendee_profiles
       set user_id = new.user_id, updated_at = now()
     where registration_id = new.id and user_id is null;

    select avatar_url into v_avatar
      from public.attendee_profiles
     where registration_id = new.id and avatar_url is not null;

    if v_avatar is not null then
      update public.profiles set avatar_url = v_avatar
       where id = new.user_id and avatar_url is null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_link_attendee_profile_on_reg_link on public.registrations;
create trigger trg_link_attendee_profile_on_reg_link
  after update of user_id on public.registrations
  for each row execute function public.link_attendee_profile_on_reg_link();
