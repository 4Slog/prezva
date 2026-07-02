-- 1. reserved handles (single source of truth)
create table if not exists public.reserved_handles (handle text primary key);
insert into public.reserved_handles (handle) values
  ('admin'),('administrator'),('api'),('app'),('help'),('support'),('about'),('contact'),
  ('terms'),('privacy'),('login'),('signin'),('signup'),('register'),('logout'),('settings'),
  ('me'),('you'),('user'),('users'),('profile'),('profiles'),('prezva'),('root'),('system'),
  ('null'),('undefined'),('staff'),('mod'),('moderator'),('official'),('everyone'),('here'),
  ('event'),('events'),('org'),('orgs'),('billing'),('dashboard')
on conflict (handle) do nothing;

-- 2. add column (nullable for now, backfill, then constrain)
alter table public.profiles add column handle text;

-- 3. generator: slugify base, ensure not-reserved and globally unique (case-insensitive)
create or replace function public.generate_unique_handle(base text)
returns text language plpgsql security definer set search_path to 'public' as $fn$
declare slug text; candidate text; n int := 1;
begin
  slug := lower(coalesce(base, ''));
  slug := regexp_replace(slug, '[^a-z0-9]+', '_', 'g');
  slug := regexp_replace(slug, '_+', '_', 'g');
  slug := trim(both '_' from slug);
  if slug is null or length(slug) < 3 then slug := 'user'; end if;
  if length(slug) > 24 then slug := trim(both '_' from left(slug, 24)); end if;
  if length(slug) < 3 then slug := 'user'; end if;
  candidate := slug;
  while exists (select 1 from public.reserved_handles r where r.handle = candidate)
     or exists (select 1 from public.profiles p where lower(p.handle) = candidate) loop
    n := n + 1; candidate := slug || n::text;
  end loop;
  return candidate;
end $fn$;

-- 4. backfill existing rows ROW-BY-ROW (each call must see prior assignments)
do $bf$
declare r record;
begin
  for r in select id, full_name, email from public.profiles where handle is null order by created_at nulls first, id loop
    update public.profiles
      set handle = public.generate_unique_handle(coalesce(nullif(r.full_name,''), split_part(r.email,'@',1)))
      where id = r.id;
  end loop;
end $bf$;

-- 5. constraints (after backfill)
alter table public.profiles alter column handle set not null;
create unique index profiles_handle_lower_key on public.profiles (lower(handle));
alter table public.profiles add constraint profiles_handle_format check (handle ~ '^[a-z0-9_]{3,30}$');

-- 6. trigger: every new account born with a unique handle; race-safe retry on unique collision
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path to 'public' as $hnu$
declare base text := coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1));
        h text; attempt int := 0;
begin
  loop
    attempt := attempt + 1;
    h := public.generate_unique_handle(base);
    begin
      insert into public.profiles (id, email, full_name, avatar_url, handle)
      values (new.id, new.email,
              coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
              new.raw_user_meta_data->>'avatar_url', h);
      exit;
    exception when unique_violation then
      if attempt >= 5 then
        insert into public.profiles (id, email, full_name, avatar_url, handle)
        values (new.id, new.email,
                coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
                new.raw_user_meta_data->>'avatar_url',
                left(h,24) || floor(random()*100000)::text);
        exit;
      end if;
    end;
  end loop;
  return new;
end $hnu$;

-- 7. expose handle in the directory view
create or replace view public.event_visible_profiles with (security_invoker = false) as
select ap.id, ap.registration_id, ap.event_id, ap.user_id, r.attendee_name,
  ap.company, ap.job_title, ap.bio, ap.interests, ap.avatar_url,
  ap.linkedin_url, ap.twitter_url, ap.website_url, tt.name as ticket_name, ap.created_at, pr.handle
from public.attendee_profiles ap
join public.registrations r on r.id = ap.registration_id
left join public.ticket_types tt on tt.id = r.ticket_type_id
left join public.profiles pr on pr.id = ap.user_id
where ap.is_visible = true and is_registered(ap.event_id);
grant select on public.event_visible_profiles to authenticated;
