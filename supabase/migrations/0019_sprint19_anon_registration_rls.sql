-- Sprint 19: Fix anonymous registration RLS blocker
--
-- Audit 3 finding: Public registration form returned
-- "new row violates row-level security policy for table registrations"
-- because the registrations_insert policy required auth.uid() is not null.
--
-- Whova-style anonymous registration is the standard pattern. The server action
-- validates ticket availability, capacity, sale windows, discount codes, and
-- membership requirements before inserting, so allowing anon insert here is
-- still safe behind the server action.

begin;

drop policy if exists "registrations_insert" on public.registrations;

create policy "registrations_insert"
  on public.registrations for insert
  with check (
    -- Allow registration for any event in published or live state.
    -- All other validation (capacity, ticket availability, etc.) is enforced
    -- in the server action (src/lib/registration/actions.ts).
    exists (
      select 1 from public.events e
      where e.id = event_id
        and e.status in ('published', 'live')
    )
  );

-- Note: registrations_select policy remains strict (auth.uid() match or staff
-- role only). Public-facing reads (confirmation page after registration, my-qr
-- email lookup) use the service-role admin client in the server actions/page
-- components themselves, so they correctly bypass RLS for those narrow flows
-- without exposing the SELECT to all anonymous traffic.

commit;
