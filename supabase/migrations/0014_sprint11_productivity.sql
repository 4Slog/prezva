-- Sprint 11: Productivity tools

-- T-095: Badge template reuse — org-level templates
ALTER TABLE badge_templates ADD COLUMN IF NOT EXISTS is_template boolean NOT NULL DEFAULT false;
ALTER TABLE badge_templates ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE CASCADE;

-- T-119: Clone event — parent_event_id for tracking clones
ALTER TABLE events ADD COLUMN IF NOT EXISTS parent_event_id uuid REFERENCES events(id) ON DELETE SET NULL;

-- T-120: Event templates
CREATE TABLE IF NOT EXISTS event_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  template_data jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE event_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "event_templates_service_only" ON event_templates USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS event_templates_org_idx ON event_templates(org_id);

-- T-121: Recurring event replication
ALTER TABLE events ADD COLUMN IF NOT EXISTS recurrence text CHECK (recurrence IN ('annual', 'quarterly', 'monthly'));
ALTER TABLE events ADD COLUMN IF NOT EXISTS next_occurrence_date date;
