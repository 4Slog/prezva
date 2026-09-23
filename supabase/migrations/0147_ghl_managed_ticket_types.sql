-- O95/D2: a GHL-created ticket type is unique per (event_id, lower(name)).
--
-- There is no uniqueness on ticket_types (event_id, name) today, so two seats of
-- one GHL order that arrive milliseconds apart both miss the resolver's read and
-- both insert. That is how the live 2-seat recon order minted TWO "GHL Registration"
-- rows 51ms apart, one registration hanging off each. After O94 the same race mints
-- two "Early Bird" rows instead — visible to the organizer on every multi-seat order.
--
-- A2 forbids changing standalone behaviour: organizers may legitimately name two of
-- their own tiers the same, so the constraint may bind ONLY rows Prezva created from
-- GHL. That is what ticket_types.ghl_managed is for, and why the unique index below
-- is PARTIAL on it. The resolver in src/lib/ghl/events-bridge.ts is the only writer
-- of this column; nothing else in the codebase sets it.
--
-- Accepted seam, stated rather than hidden: the dedupe and the backfill below both
-- scope by "the event has a ghl_event_id", not by provenance, because at this point
-- in the migration no provenance is recorded yet — the column is being introduced.
-- So a tier an organizer hand-created on a GHL-PAIRED event is treated as GHL-managed
-- by this one-time backfill. On the live database that set is empty (the single
-- GHL-paired event carries exactly the two resolver-minted rows above), and from here
-- on only the resolver sets the flag, so organizer tiers on a paired event stay out of
-- the index. The backfill also bumps updated_at on the rows it marks, via
-- trg_ticket_types_updated_at.
--
-- Re-running this file is a no-op: every step is guarded or set-based over a
-- duplicate set that is empty the second time.

-- ── 1. The flag ──────────────────────────────────────────────────────────────

alter table public.ticket_types
  add column if not exists ghl_managed boolean not null default false;

-- ── 2. Dedupe the GHL-created duplicates, BEFORE the index ───────────────────
--
-- Keeper is the OLDEST row of each (event_id, lower(name)) group on an event with
-- a ghl_event_id; id breaks a created_at tie so the choice is deterministic and
-- the same in every statement below.
--
-- SEVEN foreign keys reference ticket_types, not one. Four of them are ON DELETE
-- CASCADE (form_fields, session_ticket_access, ticket_invite_allowlist,
-- ticket_type_product_mappings) and one is ON DELETE SET NULL (abandoned_carts) —
-- deleting a loser without repointing first would destroy or orphan those rows
-- silently. Every one is repointed here before the delete.
--
-- Four of the seven also carry a unique constraint that INCLUDES ticket_type_id, so
-- a blind repoint can raise 23505. Each of those gets a not-exists guard; a row that
-- would collide is a functional duplicate of one the keeper already has, and it is
-- cascade-deleted with the loser rather than repointed over the top of the original.

-- 2a. abandoned_carts — ON DELETE SET NULL, no unique constraint on ticket_type_id.
with ghl_types as (
  select tt.id,
         first_value(tt.id) over (
           partition by tt.event_id, lower(tt.name) order by tt.created_at, tt.id
         ) as keeper_id
    from public.ticket_types tt
    join public.events e on e.id = tt.event_id
   where e.ghl_event_id is not null
),
losers as (select id as loser_id, keeper_id from ghl_types where id <> keeper_id)
update public.abandoned_carts t
   set ticket_type_id = l.keeper_id
  from losers l
 where t.ticket_type_id = l.loser_id;

-- 2b. form_fields — ON DELETE CASCADE, no unique constraint on ticket_type_id.
with ghl_types as (
  select tt.id,
         first_value(tt.id) over (
           partition by tt.event_id, lower(tt.name) order by tt.created_at, tt.id
         ) as keeper_id
    from public.ticket_types tt
    join public.events e on e.id = tt.event_id
   where e.ghl_event_id is not null
),
losers as (select id as loser_id, keeper_id from ghl_types where id <> keeper_id)
update public.form_fields t
   set ticket_type_id = l.keeper_id
  from losers l
 where t.ticket_type_id = l.loser_id;

-- 2c. group_tickets — ON DELETE NO ACTION, no unique constraint on ticket_type_id.
-- Always fully drained, so it never blocks the delete in 2h.
with ghl_types as (
  select tt.id,
         first_value(tt.id) over (
           partition by tt.event_id, lower(tt.name) order by tt.created_at, tt.id
         ) as keeper_id
    from public.ticket_types tt
    join public.events e on e.id = tt.event_id
   where e.ghl_event_id is not null
),
losers as (select id as loser_id, keeper_id from ghl_types where id <> keeper_id)
update public.group_tickets t
   set ticket_type_id = l.keeper_id
  from losers l
 where t.ticket_type_id = l.loser_id;

-- 2d. registrations — ON DELETE NO ACTION. This is the paid seat, and the whole
-- point of the exercise: both seats of the recon order must end up on the keeper.
-- registrations_no_duplicate_idx is UNIQUE (event_id, attendee_email, ticket_type_id)
-- WHERE status <> 'cancelled', so a seat is left in place only when the same attendee
-- already holds a live registration on the keeper — which would be a genuine double
-- booking, not something to silently merge. A cancelled row can always move.
with ghl_types as (
  select tt.id,
         first_value(tt.id) over (
           partition by tt.event_id, lower(tt.name) order by tt.created_at, tt.id
         ) as keeper_id
    from public.ticket_types tt
    join public.events e on e.id = tt.event_id
   where e.ghl_event_id is not null
),
losers as (select id as loser_id, keeper_id from ghl_types where id <> keeper_id)
update public.registrations t
   set ticket_type_id = l.keeper_id
  from losers l
 where t.ticket_type_id = l.loser_id
   and (
     t.status = 'cancelled'
     or not exists (
       select 1 from public.registrations k
        where k.event_id       = t.event_id
          and k.attendee_email = t.attendee_email
          and k.ticket_type_id = l.keeper_id
          and k.status <> 'cancelled'
     )
   );

-- 2e. session_ticket_access — ON DELETE CASCADE, PK (session_id, ticket_type_id).
with ghl_types as (
  select tt.id,
         first_value(tt.id) over (
           partition by tt.event_id, lower(tt.name) order by tt.created_at, tt.id
         ) as keeper_id
    from public.ticket_types tt
    join public.events e on e.id = tt.event_id
   where e.ghl_event_id is not null
),
losers as (select id as loser_id, keeper_id from ghl_types where id <> keeper_id)
update public.session_ticket_access t
   set ticket_type_id = l.keeper_id
  from losers l
 where t.ticket_type_id = l.loser_id
   and not exists (
     select 1 from public.session_ticket_access k
      where k.session_id = t.session_id and k.ticket_type_id = l.keeper_id
   );

-- 2f. ticket_invite_allowlist — ON DELETE CASCADE, UNIQUE (ticket_type_id, email).
with ghl_types as (
  select tt.id,
         first_value(tt.id) over (
           partition by tt.event_id, lower(tt.name) order by tt.created_at, tt.id
         ) as keeper_id
    from public.ticket_types tt
    join public.events e on e.id = tt.event_id
   where e.ghl_event_id is not null
),
losers as (select id as loser_id, keeper_id from ghl_types where id <> keeper_id)
update public.ticket_invite_allowlist t
   set ticket_type_id = l.keeper_id
  from losers l
 where t.ticket_type_id = l.loser_id
   and not exists (
     select 1 from public.ticket_invite_allowlist k
      where k.ticket_type_id = l.keeper_id and k.email = t.email
   );

-- 2g. ticket_type_product_mappings — ON DELETE CASCADE, uq_ttpm_ticket_type is
-- UNIQUE on ticket_type_id alone, so the keeper may hold at most one mapping.
with ghl_types as (
  select tt.id,
         first_value(tt.id) over (
           partition by tt.event_id, lower(tt.name) order by tt.created_at, tt.id
         ) as keeper_id
    from public.ticket_types tt
    join public.events e on e.id = tt.event_id
   where e.ghl_event_id is not null
),
losers as (select id as loser_id, keeper_id from ghl_types where id <> keeper_id)
update public.ticket_type_product_mappings t
   set ticket_type_id = l.keeper_id
  from losers l
 where t.ticket_type_id = l.loser_id
   and not exists (
     select 1 from public.ticket_type_product_mappings k
      where k.ticket_type_id = l.keeper_id
   );

-- 2h. Delete the losers — but only those fully drained of the two NO ACTION
-- references. A paid seat is never deleted to make a constraint fit; a loser that
-- still carries one survives, is left ghl_managed = false by step 3, and so stays
-- outside the partial index in step 4 rather than failing the migration.
with ghl_types as (
  select tt.id,
         first_value(tt.id) over (
           partition by tt.event_id, lower(tt.name) order by tt.created_at, tt.id
         ) as keeper_id
    from public.ticket_types tt
    join public.events e on e.id = tt.event_id
   where e.ghl_event_id is not null
),
losers as (select id as loser_id, keeper_id from ghl_types where id <> keeper_id)
delete from public.ticket_types tt
 using losers l
 where tt.id = l.loser_id
   and not exists (select 1 from public.registrations r where r.ticket_type_id = tt.id)
   and not exists (select 1 from public.group_tickets g where g.ticket_type_id = tt.id);

-- ── 3. Backfill the flag ─────────────────────────────────────────────────────
--
-- Every ticket type on a GHL-paired event EXCEPT a surviving duplicate loser: the
-- not-exists clause marks a row only when no older row shares its (event_id,
-- lower(name)), which is true of every keeper and every singleton. A loser that
-- step 2h could not delete stays false on purpose.
update public.ticket_types tt
   set ghl_managed = true
  from public.events e
 where e.id = tt.event_id
   and e.ghl_event_id is not null
   and tt.ghl_managed is distinct from true
   and not exists (
     select 1 from public.ticket_types older
      where older.event_id          = tt.event_id
        and lower(older.name)       = lower(tt.name)
        and (older.created_at, older.id) < (tt.created_at, tt.id)
   );

-- ── 4. The constraint ────────────────────────────────────────────────────────
--
-- PARTIAL on ghl_managed. Organizer-created tiers on standalone events — and on
-- GHL-paired events from here on — are untouched and may still share a name (A2).
-- The resolver's create already recovers from a 23505 on this index by re-reading
-- the attempted name, which is the losing seat finding the winner's row.
create unique index if not exists uq_ticket_types_ghl_managed_event_name
  on public.ticket_types (event_id, lower(name))
  where ghl_managed;
