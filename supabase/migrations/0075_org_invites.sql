CREATE TABLE IF NOT EXISTS org_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'staff' CHECK (role IN ('admin','staff')),
  token uuid DEFAULT gen_random_uuid() UNIQUE,
  invited_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  accepted_at timestamptz,
  UNIQUE(org_id, email)
);
ALTER TABLE org_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_invites_org_members" ON org_invites FOR ALL USING (
  EXISTS (SELECT 1 FROM org_members WHERE org_id = org_invites.org_id AND user_id = auth.uid())
);
