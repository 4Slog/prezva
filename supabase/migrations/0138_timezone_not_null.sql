-- 0137 dropped the DEFAULT 'America/Chicago' on events.timezone and
-- organizations.timezone but left both nullable (they were already nullable
-- pre-0137, despite carrying a default). Every app-level insert path now
-- supplies a value explicitly, so enforce it at the DB layer too — a
-- forgotten timezone should fail loudly, not silently insert NULL.
-- profiles stays nullable: it has no app-level insert path (only the
-- timezone-ignorant handle_new_user trigger), so null is its design.

alter table public.events alter column timezone set not null;
alter table public.organizations alter column timezone set not null;
