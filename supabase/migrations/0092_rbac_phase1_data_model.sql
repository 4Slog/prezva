-- ============================================================
-- RBAC Phase 1: permissions/roles/role_permissions data model
-- + 55-key catalog seed + built-in roles (additive, no cutover)
-- Existing org_members.role enum column untouched.
-- ============================================================

-- Step 1: permissions table
CREATE TABLE public.permissions (
  key         text PRIMARY KEY,
  category    text NOT NULL CHECK (category IN ('org','core','engagement','advanced')),
  label       text NOT NULL,
  description text,
  created_at  timestamptz DEFAULT now()
);

-- Step 2: roles table (per-org)
CREATE TABLE public.roles (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name        text NOT NULL,
  slug        text NOT NULL,
  is_builtin  boolean NOT NULL DEFAULT false,
  description text,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(org_id, slug)
);

-- Step 3: role_permissions join
CREATE TABLE public.role_permissions (
  role_id        uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES permissions(key) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_key)
);

-- Step 4: add role_id to org_members (nullable FK; existing role enum untouched)
ALTER TABLE public.org_members
  ADD COLUMN role_id uuid REFERENCES roles(id);

-- Step 5: seed permissions catalog (55 keys — verbatim from rbac_phase1_seed.sql)
INSERT INTO permissions (key, category, label) VALUES
  ('agenda.manage', 'core', 'Agenda/sessions/schedule (manage)'),
  ('agenda.view', 'core', 'Agenda/sessions/schedule (view)'),
  ('analytics.manage', 'advanced', 'Analytics & reporting (manage)'),
  ('analytics.view', 'advanced', 'Analytics & reporting (view)'),
  ('announcements.manage', 'engagement', 'Announcements'),
  ('announcements.send', 'engagement', 'Announcements send'),
  ('attendees.edit', 'core', 'Attendees edit/add/cancel'),
  ('attendees.manage', 'core', 'Attendees view & search (manage)'),
  ('attendees.refund', 'core', 'Attendees refunds'),
  ('attendees.view', 'core', 'Attendees view & search (view)'),
  ('badges.manage', 'core', 'Badges design & print'),
  ('certificates.manage', 'advanced', 'Certificates issue/eligibility'),
  ('checkin.manage', 'core', 'Check-in (QR/kiosk/walk-in)'),
  ('checkin.undo', 'core', 'Undo check-in'),
  ('community.manage', 'engagement', 'Community feed/moderation'),
  ('event.audit_log', 'advanced', 'Event audit log'),
  ('event.integrations', 'advanced', 'Event integrations'),
  ('event.manage', 'core', 'Create/configure events'),
  ('event.tickets', 'core', 'Tickets/pricing/capacity/discounts'),
  ('failed_jobs.manage', 'advanced', 'Failed jobs retry'),
  ('icebreakers.manage', 'engagement', 'Icebreakers'),
  ('leaderboard.manage', 'engagement', 'Leaderboard/gamification (manage)'),
  ('leaderboard.view', 'engagement', 'Leaderboard/gamification (view)'),
  ('networking.manage', 'engagement', 'Networking/matchmaking (manage)'),
  ('networking.view', 'engagement', 'Networking/matchmaking (view)'),
  ('org.audit_log', 'org', 'Org audit log'),
  ('org.billing', 'org', 'Billing & subscription'),
  ('org.branding', 'org', 'Org branding'),
  ('org.certificate_templates', 'org', 'Certificate templates'),
  ('org.delete', 'org', 'Delete organization'),
  ('org.integrations', 'org', 'Org integrations'),
  ('org.members.invite', 'org', 'Members invite/remove/change role'),
  ('org.members.manage', 'org', 'Members (manage)'),
  ('org.members.view', 'org', 'Members (view)'),
  ('org.roles.manage', 'org', 'Roles create/edit/delete (manage)'),
  ('org.roles.view', 'org', 'Roles create/edit/delete (view)'),
  ('org.settings', 'org', 'Org settings'),
  ('org.speaker_library.manage', 'org', 'Speaker library (manage)'),
  ('org.speaker_library.view', 'org', 'Speaker library (view)'),
  ('org.templates.manage', 'org', 'Templates library (manage)'),
  ('org.templates.view', 'org', 'Templates library (view)'),
  ('passport.manage', 'engagement', 'Passport booth game'),
  ('photos.manage', 'engagement', 'Photos gallery'),
  ('run_of_show.manage', 'advanced', 'Run of show (manage)'),
  ('run_of_show.view', 'advanced', 'Run of show (view)'),
  ('speakers.manage', 'core', 'Speakers manage (manage)'),
  ('speakers.view', 'core', 'Speakers manage (view)'),
  ('sponsors.manage', 'advanced', 'Sponsors/exhibitors (manage)'),
  ('sponsors.view', 'advanced', 'Sponsors/exhibitors (view)'),
  ('surveys.manage', 'engagement', 'Surveys build/results (manage)'),
  ('surveys.view', 'engagement', 'Surveys build/results (view)'),
  ('trivia.manage', 'engagement', 'Trivia live game'),
  ('video.manage', 'advanced', 'Live video/broadcast/rooms (manage)'),
  ('video.view', 'advanced', 'Live video/broadcast/rooms (view)'),
  ('volunteers.manage', 'core', 'Volunteers manage');

-- Step 6: seed built-in roles (owner/admin/staff × 5 orgs = 15 rows)
INSERT INTO public.roles (org_id, name, slug, is_builtin, description)
  SELECT id, 'Owner', 'owner', true, 'Full access' FROM organizations;

INSERT INTO public.roles (org_id, name, slug, is_builtin, description)
  SELECT id, 'Admin', 'admin', true, 'Administrative access (no billing/delete/role management)' FROM organizations;

INSERT INTO public.roles (org_id, name, slug, is_builtin, description)
  SELECT id, 'Staff', 'staff', true, 'Operational access' FROM organizations;

-- Step 7: role_permissions — verbatim from rbac_phase1_seed.sql (owner 55 / admin 52 / staff 26 per org)
INSERT INTO role_permissions (role_id, permission_key)
  SELECT r.id, p.key FROM roles r JOIN permissions p
  ON p.key IN ('agenda.manage', 'agenda.view', 'analytics.manage', 'analytics.view', 'announcements.manage', 'announcements.send', 'attendees.edit', 'attendees.manage', 'attendees.refund', 'attendees.view', 'badges.manage', 'certificates.manage', 'checkin.manage', 'checkin.undo', 'community.manage', 'event.audit_log', 'event.integrations', 'event.manage', 'event.tickets', 'failed_jobs.manage', 'icebreakers.manage', 'leaderboard.manage', 'leaderboard.view', 'networking.manage', 'networking.view', 'org.audit_log', 'org.billing', 'org.branding', 'org.certificate_templates', 'org.delete', 'org.integrations', 'org.members.invite', 'org.members.manage', 'org.members.view', 'org.roles.manage', 'org.roles.view', 'org.settings', 'org.speaker_library.manage', 'org.speaker_library.view', 'org.templates.manage', 'org.templates.view', 'passport.manage', 'photos.manage', 'run_of_show.manage', 'run_of_show.view', 'speakers.manage', 'speakers.view', 'sponsors.manage', 'sponsors.view', 'surveys.manage', 'surveys.view', 'trivia.manage', 'video.manage', 'video.view', 'volunteers.manage')
  WHERE r.slug = 'owner' AND r.is_builtin = true;

INSERT INTO role_permissions (role_id, permission_key)
  SELECT r.id, p.key FROM roles r JOIN permissions p
  ON p.key IN ('agenda.manage', 'agenda.view', 'analytics.manage', 'analytics.view', 'announcements.manage', 'announcements.send', 'attendees.edit', 'attendees.manage', 'attendees.refund', 'attendees.view', 'badges.manage', 'certificates.manage', 'checkin.manage', 'checkin.undo', 'community.manage', 'event.audit_log', 'event.integrations', 'event.manage', 'event.tickets', 'failed_jobs.manage', 'icebreakers.manage', 'leaderboard.manage', 'leaderboard.view', 'networking.manage', 'networking.view', 'org.audit_log', 'org.branding', 'org.certificate_templates', 'org.integrations', 'org.members.invite', 'org.members.manage', 'org.members.view', 'org.roles.view', 'org.settings', 'org.speaker_library.manage', 'org.speaker_library.view', 'org.templates.manage', 'org.templates.view', 'passport.manage', 'photos.manage', 'run_of_show.manage', 'run_of_show.view', 'speakers.manage', 'speakers.view', 'sponsors.manage', 'sponsors.view', 'surveys.manage', 'surveys.view', 'trivia.manage', 'video.manage', 'video.view', 'volunteers.manage')
  WHERE r.slug = 'admin' AND r.is_builtin = true;

INSERT INTO role_permissions (role_id, permission_key)
  SELECT r.id, p.key FROM roles r JOIN permissions p
  ON p.key IN ('agenda.manage', 'agenda.view', 'analytics.view', 'announcements.manage', 'attendees.edit', 'attendees.manage', 'attendees.view', 'badges.manage', 'checkin.manage', 'community.manage', 'icebreakers.manage', 'leaderboard.view', 'networking.view', 'org.members.view', 'org.speaker_library.view', 'org.templates.view', 'passport.manage', 'photos.manage', 'run_of_show.manage', 'run_of_show.view', 'speakers.view', 'sponsors.view', 'surveys.view', 'trivia.manage', 'video.view', 'volunteers.manage')
  WHERE r.slug = 'staff' AND r.is_builtin = true;

-- Step 8: backfill org_members.role_id from existing enum
UPDATE public.org_members m
  SET role_id = r.id
  FROM public.roles r
  WHERE r.org_id = m.org_id
    AND r.slug = m.role::text
    AND r.is_builtin = true;

-- Step 9: RLS — deny-by-default; SELECT only for authenticated
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "permissions_select" ON public.permissions
  FOR SELECT TO authenticated USING (true);

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roles_select" ON public.roles
  FOR SELECT TO authenticated USING (public.is_org_member(org_id));

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "role_permissions_select" ON public.role_permissions
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.roles r
      WHERE r.id = role_permissions.role_id
        AND public.is_org_member(r.org_id)
    )
  );
