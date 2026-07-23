-- Derive timezone from org/browser instead of hardcoding America/Chicago.
-- Every app-level insert path into events and organizations now supplies an
-- explicit timezone (see GE timezone-defaults work), so both keep NOT NULL
-- and only lose the column default. profiles has no app-level insert path —
-- it's populated solely by the handle_new_user() trigger on auth.users, which
-- cannot see a browser timezone — so null is the design: "unknown, derive at
-- point of use" rather than a guessed default.

alter table public.events alter column timezone drop default;
alter table public.organizations alter column timezone drop default;
alter table public.profiles alter column timezone drop default;
alter table public.profiles alter column timezone drop not null;
