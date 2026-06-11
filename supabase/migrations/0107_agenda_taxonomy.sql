-- ── 0107: Agenda taxonomy ────────────────────────────────────────────────────
-- Converts sessions.session_type from a hard Postgres enum to open text so
-- orgs can define custom session types alongside the 7 built-ins.
-- Also creates org_session_types for org-scoped custom type definitions.

-- 1. Remove the column default (enum default must be dropped before type change)
ALTER TABLE sessions ALTER COLUMN session_type DROP DEFAULT;

-- 2. Convert the column to plain text, preserving all existing values
ALTER TABLE sessions
  ALTER COLUMN session_type TYPE text
  USING session_type::text;

-- 3. Restore the default (now a text literal)
ALTER TABLE sessions ALTER COLUMN session_type SET DEFAULT 'talk';

-- 4. Drop the now-unused enum type
DROP TYPE IF EXISTS session_type;

-- ── org_session_types ─────────────────────────────────────────────────────────
-- Stores custom session type definitions per org. Built-in types (talk, workshop,
-- panel, keynote, break, networking, other) are code constants, not DB rows.

CREATE TABLE org_session_types (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  slug        text        NOT NULL,
  label       text        NOT NULL,
  color       text,
  sort_order  int         NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, slug)
);

CREATE INDEX idx_org_session_types_org_id ON org_session_types (org_id);

ALTER TABLE org_session_types ENABLE ROW LEVEL SECURITY;

-- Any org member can read their org's custom types
CREATE POLICY "members read org session types"
  ON org_session_types FOR SELECT
  USING ( is_org_member(org_id) );

-- Agenda managers can create, update, and delete custom types.
-- We use agenda.manage for DELETE (not event.manage as tracks does) because
-- deleting a custom type has no FK cascade — sessions simply retain the text
-- slug, so the blast radius is low and the permission key is consistent.
CREATE POLICY "managers manage org session types"
  ON org_session_types FOR ALL
  USING     ( has_permission(org_id, 'agenda.manage') )
  WITH CHECK ( has_permission(org_id, 'agenda.manage') );
