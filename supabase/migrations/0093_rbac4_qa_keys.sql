-- rbac4_qa_keys: Add session Q&A permission keys and grant to all built-in roles across all orgs
-- Phase 4 Batch 0A: additive-only, no policy changes

INSERT INTO permissions (key, category, label) VALUES
  ('qa.view',     'engagement', 'Session Q&A (view/post)'),
  ('qa.moderate', 'engagement', 'Session Q&A moderation');

-- Grant both keys to Owner, Admin, Staff for all 5 orgs (3 roles × 5 orgs × 2 keys = 30 rows)
INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, p.key
FROM roles r
CROSS JOIN (VALUES ('qa.view'), ('qa.moderate')) AS p(key)
WHERE r.name IN ('Owner', 'Admin', 'Staff')
  AND r.org_id IN (
    '11111111-1111-4111-8111-111111111101',
    '22222222-2222-4222-8222-222222222201',
    '33333333-3333-4333-8333-333333333301',
    '44444444-4444-4444-8444-444444444401',
    'e0ecf103-4252-4c74-a691-f7497f554775'
  );

-- Verify: permissions=57, Owner=285, Admin=270, Staff=140
-- SELECT count(*) FROM permissions;
-- SELECT r.name, count(*) FROM role_permissions rp JOIN roles r ON r.id = rp.role_id GROUP BY r.name;
