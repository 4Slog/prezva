-- phase4_matrix.sql — RLS regression harness for RBAC Phase 4
-- Tests has_org_role() (current) and has_permission() (Phase 4 replacement) for each user-org pair.
-- Usage: run each block independently via Supabase MCP execute_sql or psql.
-- Save results to baseline_matrix.txt BEFORE any policy swaps.
-- Re-run after each batch and diff against baseline.
--
-- Orgs:
--   meridian  = 11111111-1111-4111-8111-111111111101
--   saup      = 22222222-2222-4222-8222-222222222201
--   chamber   = 33333333-3333-4333-8333-333333333301
--   oss-atl   = 44444444-4444-4444-8444-444444444401
--   test-llc  = e0ecf103-4252-4c74-a691-f7497f554775
--
-- Users:
--   paul (43280c9b)           = Owner@meridian, Staff@saup, Owner@test-llc
--   james (75e38057)          = Admin@saup, Staff@oss-atl
--   saup-director (99d719df)  = Owner@saup
--   meridian-admin (3858d1e3) = Admin@meridian
--   chamber-admin (6d8c67b7)  = Admin@chamber
--   chamber-owner (cfd87e8a)  = Owner@chamber
--   oss-director (3bff4a53)   = Owner@oss-atl

-- ============================================================
-- BLOCK 1: james as Admin @ SAUP
-- ============================================================
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"75e38057-0cbe-4a19-951b-b1f01a0b0520","role":"authenticated"}';
SELECT
  'james' as u, 'saup' as org, 'Admin' as role,
  has_org_role('22222222-2222-4222-8222-222222222201'::uuid,'staff'::org_role) as hor_staff,
  has_org_role('22222222-2222-4222-8222-222222222201'::uuid,'admin'::org_role) as hor_admin,
  has_org_role('22222222-2222-4222-8222-222222222201'::uuid,'owner'::org_role) as hor_owner,
  has_permission('22222222-2222-4222-8222-222222222201','announcements.manage') as p_ann_view,
  has_permission('22222222-2222-4222-8222-222222222201','announcements.send') as p_ann_send,
  has_permission('22222222-2222-4222-8222-222222222201','event.manage') as p_evt_mgr,
  has_permission('22222222-2222-4222-8222-222222222201','event.tickets') as p_tickets,
  has_permission('22222222-2222-4222-8222-222222222201','agenda.view') as p_agenda_v,
  has_permission('22222222-2222-4222-8222-222222222201','agenda.manage') as p_agenda_m,
  has_permission('22222222-2222-4222-8222-222222222201','checkin.manage') as p_checkin,
  has_permission('22222222-2222-4222-8222-222222222201','speakers.view') as p_spk_v,
  has_permission('22222222-2222-4222-8222-222222222201','speakers.manage') as p_spk_m,
  has_permission('22222222-2222-4222-8222-222222222201','surveys.view') as p_surv_v,
  has_permission('22222222-2222-4222-8222-222222222201','surveys.manage') as p_surv_m,
  has_permission('22222222-2222-4222-8222-222222222201','video.manage') as p_video,
  has_permission('22222222-2222-4222-8222-222222222201','attendees.view') as p_att_v,
  has_permission('22222222-2222-4222-8222-222222222201','attendees.edit') as p_att_e,
  has_permission('22222222-2222-4222-8222-222222222201','attendees.refund') as p_refund,
  has_permission('22222222-2222-4222-8222-222222222201','org.members.invite') as p_mbr,
  has_permission('22222222-2222-4222-8222-222222222201','org.settings') as p_org_set,
  has_permission('22222222-2222-4222-8222-222222222201','org.delete') as p_org_del,
  has_permission('22222222-2222-4222-8222-222222222201','org.audit_log') as p_audit_o,
  has_permission('22222222-2222-4222-8222-222222222201','event.audit_log') as p_audit_e,
  has_permission('22222222-2222-4222-8222-222222222201','failed_jobs.manage') as p_jobs,
  has_permission('22222222-2222-4222-8222-222222222201','volunteers.manage') as p_vol,
  has_permission('22222222-2222-4222-8222-222222222201','trivia.manage') as p_trivia,
  has_permission('22222222-2222-4222-8222-222222222201','qa.view') as p_qa_v,
  has_permission('22222222-2222-4222-8222-222222222201','qa.moderate') as p_qa_m,
  (SELECT count(*) FROM events WHERE org_id='44444444-4444-4444-8444-444444444401') as cross_oss_events;
ROLLBACK;

-- ============================================================
-- BLOCK 2: james as Staff @ OpenSource ATL
-- ============================================================
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"75e38057-0cbe-4a19-951b-b1f01a0b0520","role":"authenticated"}';
SELECT
  'james' as u, 'oss-atl' as org, 'Staff' as role,
  has_org_role('44444444-4444-4444-8444-444444444401'::uuid,'staff'::org_role) as hor_staff,
  has_org_role('44444444-4444-4444-8444-444444444401'::uuid,'admin'::org_role) as hor_admin,
  has_org_role('44444444-4444-4444-8444-444444444401'::uuid,'owner'::org_role) as hor_owner,
  has_permission('44444444-4444-4444-8444-444444444401','announcements.manage') as p_ann_view,
  has_permission('44444444-4444-4444-8444-444444444401','announcements.send') as p_ann_send,
  has_permission('44444444-4444-4444-8444-444444444401','event.manage') as p_evt_mgr,
  has_permission('44444444-4444-4444-8444-444444444401','event.tickets') as p_tickets,
  has_permission('44444444-4444-4444-8444-444444444401','agenda.view') as p_agenda_v,
  has_permission('44444444-4444-4444-8444-444444444401','agenda.manage') as p_agenda_m,
  has_permission('44444444-4444-4444-8444-444444444401','checkin.manage') as p_checkin,
  has_permission('44444444-4444-4444-8444-444444444401','speakers.view') as p_spk_v,
  has_permission('44444444-4444-4444-8444-444444444401','speakers.manage') as p_spk_m,
  has_permission('44444444-4444-4444-8444-444444444401','surveys.view') as p_surv_v,
  has_permission('44444444-4444-4444-8444-444444444401','surveys.manage') as p_surv_m,
  has_permission('44444444-4444-4444-8444-444444444401','video.manage') as p_video,
  has_permission('44444444-4444-4444-8444-444444444401','attendees.view') as p_att_v,
  has_permission('44444444-4444-4444-8444-444444444401','attendees.edit') as p_att_e,
  has_permission('44444444-4444-4444-8444-444444444401','attendees.refund') as p_refund,
  has_permission('44444444-4444-4444-8444-444444444401','org.members.invite') as p_mbr,
  has_permission('44444444-4444-4444-8444-444444444401','org.settings') as p_org_set,
  has_permission('44444444-4444-4444-8444-444444444401','org.delete') as p_org_del,
  has_permission('44444444-4444-4444-8444-444444444401','org.audit_log') as p_audit_o,
  has_permission('44444444-4444-4444-8444-444444444401','event.audit_log') as p_audit_e,
  has_permission('44444444-4444-4444-8444-444444444401','failed_jobs.manage') as p_jobs,
  has_permission('44444444-4444-4444-8444-444444444401','volunteers.manage') as p_vol,
  has_permission('44444444-4444-4444-8444-444444444401','trivia.manage') as p_trivia,
  has_permission('44444444-4444-4444-8444-444444444401','qa.view') as p_qa_v,
  has_permission('44444444-4444-4444-8444-444444444401','qa.moderate') as p_qa_m,
  (SELECT count(*) FROM events WHERE org_id='22222222-2222-4222-8222-222222222201') as saup_events_visible;
ROLLBACK;

-- ============================================================
-- BLOCK 3: paul as Owner @ Meridian
-- ============================================================
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"43280c9b-60a7-4884-94b0-1c80e5af1a9d","role":"authenticated"}';
SELECT
  'paul' as u, 'meridian' as org, 'Owner' as role,
  has_org_role('11111111-1111-4111-8111-111111111101'::uuid,'staff'::org_role) as hor_staff,
  has_org_role('11111111-1111-4111-8111-111111111101'::uuid,'admin'::org_role) as hor_admin,
  has_org_role('11111111-1111-4111-8111-111111111101'::uuid,'owner'::org_role) as hor_owner,
  has_permission('11111111-1111-4111-8111-111111111101','announcements.manage') as p_ann_view,
  has_permission('11111111-1111-4111-8111-111111111101','announcements.send') as p_ann_send,
  has_permission('11111111-1111-4111-8111-111111111101','event.manage') as p_evt_mgr,
  has_permission('11111111-1111-4111-8111-111111111101','event.tickets') as p_tickets,
  has_permission('11111111-1111-4111-8111-111111111101','agenda.view') as p_agenda_v,
  has_permission('11111111-1111-4111-8111-111111111101','agenda.manage') as p_agenda_m,
  has_permission('11111111-1111-4111-8111-111111111101','checkin.manage') as p_checkin,
  has_permission('11111111-1111-4111-8111-111111111101','speakers.view') as p_spk_v,
  has_permission('11111111-1111-4111-8111-111111111101','speakers.manage') as p_spk_m,
  has_permission('11111111-1111-4111-8111-111111111101','surveys.view') as p_surv_v,
  has_permission('11111111-1111-4111-8111-111111111101','surveys.manage') as p_surv_m,
  has_permission('11111111-1111-4111-8111-111111111101','video.manage') as p_video,
  has_permission('11111111-1111-4111-8111-111111111101','attendees.view') as p_att_v,
  has_permission('11111111-1111-4111-8111-111111111101','attendees.edit') as p_att_e,
  has_permission('11111111-1111-4111-8111-111111111101','attendees.refund') as p_refund,
  has_permission('11111111-1111-4111-8111-111111111101','org.members.invite') as p_mbr,
  has_permission('11111111-1111-4111-8111-111111111101','org.settings') as p_org_set,
  has_permission('11111111-1111-4111-8111-111111111101','org.delete') as p_org_del,
  has_permission('11111111-1111-4111-8111-111111111101','org.audit_log') as p_audit_o,
  has_permission('11111111-1111-4111-8111-111111111101','event.audit_log') as p_audit_e,
  has_permission('11111111-1111-4111-8111-111111111101','failed_jobs.manage') as p_jobs,
  has_permission('11111111-1111-4111-8111-111111111101','volunteers.manage') as p_vol,
  has_permission('11111111-1111-4111-8111-111111111101','trivia.manage') as p_trivia,
  has_permission('11111111-1111-4111-8111-111111111101','qa.view') as p_qa_v,
  has_permission('11111111-1111-4111-8111-111111111101','qa.moderate') as p_qa_m,
  (SELECT count(*) FROM events WHERE org_id='44444444-4444-4444-8444-444444444401') as cross_oss_events;
ROLLBACK;

-- ============================================================
-- BLOCK 4: paul as Staff @ SAUP
-- ============================================================
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"43280c9b-60a7-4884-94b0-1c80e5af1a9d","role":"authenticated"}';
SELECT
  'paul' as u, 'saup' as org, 'Staff' as role,
  has_org_role('22222222-2222-4222-8222-222222222201'::uuid,'staff'::org_role) as hor_staff,
  has_org_role('22222222-2222-4222-8222-222222222201'::uuid,'admin'::org_role) as hor_admin,
  has_org_role('22222222-2222-4222-8222-222222222201'::uuid,'owner'::org_role) as hor_owner,
  has_permission('22222222-2222-4222-8222-222222222201','announcements.manage') as p_ann_view,
  has_permission('22222222-2222-4222-8222-222222222201','announcements.send') as p_ann_send,
  has_permission('22222222-2222-4222-8222-222222222201','event.manage') as p_evt_mgr,
  has_permission('22222222-2222-4222-8222-222222222201','event.tickets') as p_tickets,
  has_permission('22222222-2222-4222-8222-222222222201','agenda.view') as p_agenda_v,
  has_permission('22222222-2222-4222-8222-222222222201','agenda.manage') as p_agenda_m,
  has_permission('22222222-2222-4222-8222-222222222201','checkin.manage') as p_checkin,
  has_permission('22222222-2222-4222-8222-222222222201','speakers.view') as p_spk_v,
  has_permission('22222222-2222-4222-8222-222222222201','speakers.manage') as p_spk_m,
  has_permission('22222222-2222-4222-8222-222222222201','surveys.view') as p_surv_v,
  has_permission('22222222-2222-4222-8222-222222222201','surveys.manage') as p_surv_m,
  has_permission('22222222-2222-4222-8222-222222222201','video.manage') as p_video,
  has_permission('22222222-2222-4222-8222-222222222201','attendees.view') as p_att_v,
  has_permission('22222222-2222-4222-8222-222222222201','attendees.edit') as p_att_e,
  has_permission('22222222-2222-4222-8222-222222222201','attendees.refund') as p_refund,
  has_permission('22222222-2222-4222-8222-222222222201','org.members.invite') as p_mbr,
  has_permission('22222222-2222-4222-8222-222222222201','org.settings') as p_org_set,
  has_permission('22222222-2222-4222-8222-222222222201','org.delete') as p_org_del,
  has_permission('22222222-2222-4222-8222-222222222201','org.audit_log') as p_audit_o,
  has_permission('22222222-2222-4222-8222-222222222201','event.audit_log') as p_audit_e,
  has_permission('22222222-2222-4222-8222-222222222201','failed_jobs.manage') as p_jobs,
  has_permission('22222222-2222-4222-8222-222222222201','volunteers.manage') as p_vol,
  has_permission('22222222-2222-4222-8222-222222222201','trivia.manage') as p_trivia,
  has_permission('22222222-2222-4222-8222-222222222201','qa.view') as p_qa_v,
  has_permission('22222222-2222-4222-8222-222222222201','qa.moderate') as p_qa_m,
  (SELECT count(*) FROM events WHERE org_id='33333333-3333-4333-8333-333333333301') as cross_chamber_events;
ROLLBACK;

-- ============================================================
-- BLOCK 5: saup-director as Owner @ SAUP
-- ============================================================
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"99d719df-cfbf-4b16-90e3-8351db29837b","role":"authenticated"}';
SELECT
  'saup-director' as u, 'saup' as org, 'Owner' as role,
  has_org_role('22222222-2222-4222-8222-222222222201'::uuid,'staff'::org_role) as hor_staff,
  has_org_role('22222222-2222-4222-8222-222222222201'::uuid,'admin'::org_role) as hor_admin,
  has_org_role('22222222-2222-4222-8222-222222222201'::uuid,'owner'::org_role) as hor_owner,
  has_permission('22222222-2222-4222-8222-222222222201','announcements.manage') as p_ann_view,
  has_permission('22222222-2222-4222-8222-222222222201','announcements.send') as p_ann_send,
  has_permission('22222222-2222-4222-8222-222222222201','event.manage') as p_evt_mgr,
  has_permission('22222222-2222-4222-8222-222222222201','event.tickets') as p_tickets,
  has_permission('22222222-2222-4222-8222-222222222201','agenda.view') as p_agenda_v,
  has_permission('22222222-2222-4222-8222-222222222201','agenda.manage') as p_agenda_m,
  has_permission('22222222-2222-4222-8222-222222222201','checkin.manage') as p_checkin,
  has_permission('22222222-2222-4222-8222-222222222201','speakers.view') as p_spk_v,
  has_permission('22222222-2222-4222-8222-222222222201','speakers.manage') as p_spk_m,
  has_permission('22222222-2222-4222-8222-222222222201','surveys.view') as p_surv_v,
  has_permission('22222222-2222-4222-8222-222222222201','surveys.manage') as p_surv_m,
  has_permission('22222222-2222-4222-8222-222222222201','video.manage') as p_video,
  has_permission('22222222-2222-4222-8222-222222222201','attendees.view') as p_att_v,
  has_permission('22222222-2222-4222-8222-222222222201','attendees.edit') as p_att_e,
  has_permission('22222222-2222-4222-8222-222222222201','attendees.refund') as p_refund,
  has_permission('22222222-2222-4222-8222-222222222201','org.members.invite') as p_mbr,
  has_permission('22222222-2222-4222-8222-222222222201','org.settings') as p_org_set,
  has_permission('22222222-2222-4222-8222-222222222201','org.delete') as p_org_del,
  has_permission('22222222-2222-4222-8222-222222222201','org.audit_log') as p_audit_o,
  has_permission('22222222-2222-4222-8222-222222222201','event.audit_log') as p_audit_e,
  has_permission('22222222-2222-4222-8222-222222222201','failed_jobs.manage') as p_jobs,
  has_permission('22222222-2222-4222-8222-222222222201','volunteers.manage') as p_vol,
  has_permission('22222222-2222-4222-8222-222222222201','trivia.manage') as p_trivia,
  has_permission('22222222-2222-4222-8222-222222222201','qa.view') as p_qa_v,
  has_permission('22222222-2222-4222-8222-222222222201','qa.moderate') as p_qa_m,
  (SELECT count(*) FROM events WHERE org_id='33333333-3333-4333-8333-333333333301') as cross_chamber_events;
ROLLBACK;

-- ============================================================
-- BLOCK 6: meridian-admin as Admin @ Meridian
-- ============================================================
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"3858d1e3-df17-4b3e-9682-0cecfb9e4a0c","role":"authenticated"}';
SELECT
  'meridian-admin' as u, 'meridian' as org, 'Admin' as role,
  has_org_role('11111111-1111-4111-8111-111111111101'::uuid,'staff'::org_role) as hor_staff,
  has_org_role('11111111-1111-4111-8111-111111111101'::uuid,'admin'::org_role) as hor_admin,
  has_org_role('11111111-1111-4111-8111-111111111101'::uuid,'owner'::org_role) as hor_owner,
  has_permission('11111111-1111-4111-8111-111111111101','announcements.manage') as p_ann_view,
  has_permission('11111111-1111-4111-8111-111111111101','announcements.send') as p_ann_send,
  has_permission('11111111-1111-4111-8111-111111111101','event.manage') as p_evt_mgr,
  has_permission('11111111-1111-4111-8111-111111111101','event.tickets') as p_tickets,
  has_permission('11111111-1111-4111-8111-111111111101','agenda.view') as p_agenda_v,
  has_permission('11111111-1111-4111-8111-111111111101','agenda.manage') as p_agenda_m,
  has_permission('11111111-1111-4111-8111-111111111101','checkin.manage') as p_checkin,
  has_permission('11111111-1111-4111-8111-111111111101','speakers.view') as p_spk_v,
  has_permission('11111111-1111-4111-8111-111111111101','speakers.manage') as p_spk_m,
  has_permission('11111111-1111-4111-8111-111111111101','surveys.view') as p_surv_v,
  has_permission('11111111-1111-4111-8111-111111111101','surveys.manage') as p_surv_m,
  has_permission('11111111-1111-4111-8111-111111111101','video.manage') as p_video,
  has_permission('11111111-1111-4111-8111-111111111101','attendees.view') as p_att_v,
  has_permission('11111111-1111-4111-8111-111111111101','attendees.edit') as p_att_e,
  has_permission('11111111-1111-4111-8111-111111111101','attendees.refund') as p_refund,
  has_permission('11111111-1111-4111-8111-111111111101','org.members.invite') as p_mbr,
  has_permission('11111111-1111-4111-8111-111111111101','org.settings') as p_org_set,
  has_permission('11111111-1111-4111-8111-111111111101','org.delete') as p_org_del,
  has_permission('11111111-1111-4111-8111-111111111101','org.audit_log') as p_audit_o,
  has_permission('11111111-1111-4111-8111-111111111101','event.audit_log') as p_audit_e,
  has_permission('11111111-1111-4111-8111-111111111101','failed_jobs.manage') as p_jobs,
  has_permission('11111111-1111-4111-8111-111111111101','volunteers.manage') as p_vol,
  has_permission('11111111-1111-4111-8111-111111111101','trivia.manage') as p_trivia,
  has_permission('11111111-1111-4111-8111-111111111101','qa.view') as p_qa_v,
  has_permission('11111111-1111-4111-8111-111111111101','qa.moderate') as p_qa_m,
  (SELECT count(*) FROM events WHERE org_id='44444444-4444-4444-8444-444444444401') as cross_oss;
ROLLBACK;

-- ============================================================
-- BLOCK 7: chamber-admin as Admin @ Chamber
-- ============================================================
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"6d8c67b7-a952-4c80-9b8a-0310b1a5ec15","role":"authenticated"}';
SELECT
  'chamber-admin' as u, 'chamber' as org, 'Admin' as role,
  has_org_role('33333333-3333-4333-8333-333333333301'::uuid,'staff'::org_role) as hor_staff,
  has_org_role('33333333-3333-4333-8333-333333333301'::uuid,'admin'::org_role) as hor_admin,
  has_org_role('33333333-3333-4333-8333-333333333301'::uuid,'owner'::org_role) as hor_owner,
  has_permission('33333333-3333-4333-8333-333333333301','announcements.manage') as p_ann_view,
  has_permission('33333333-3333-4333-8333-333333333301','announcements.send') as p_ann_send,
  has_permission('33333333-3333-4333-8333-333333333301','event.manage') as p_evt_mgr,
  has_permission('33333333-3333-4333-8333-333333333301','event.tickets') as p_tickets,
  has_permission('33333333-3333-4333-8333-333333333301','agenda.view') as p_agenda_v,
  has_permission('33333333-3333-4333-8333-333333333301','agenda.manage') as p_agenda_m,
  has_permission('33333333-3333-4333-8333-333333333301','checkin.manage') as p_checkin,
  has_permission('33333333-3333-4333-8333-333333333301','speakers.view') as p_spk_v,
  has_permission('33333333-3333-4333-8333-333333333301','speakers.manage') as p_spk_m,
  has_permission('33333333-3333-4333-8333-333333333301','surveys.view') as p_surv_v,
  has_permission('33333333-3333-4333-8333-333333333301','surveys.manage') as p_surv_m,
  has_permission('33333333-3333-4333-8333-333333333301','video.manage') as p_video,
  has_permission('33333333-3333-4333-8333-333333333301','attendees.view') as p_att_v,
  has_permission('33333333-3333-4333-8333-333333333301','attendees.edit') as p_att_e,
  has_permission('33333333-3333-4333-8333-333333333301','attendees.refund') as p_refund,
  has_permission('33333333-3333-4333-8333-333333333301','org.members.invite') as p_mbr,
  has_permission('33333333-3333-4333-8333-333333333301','org.settings') as p_org_set,
  has_permission('33333333-3333-4333-8333-333333333301','org.delete') as p_org_del,
  has_permission('33333333-3333-4333-8333-333333333301','org.audit_log') as p_audit_o,
  has_permission('33333333-3333-4333-8333-333333333301','event.audit_log') as p_audit_e,
  has_permission('33333333-3333-4333-8333-333333333301','failed_jobs.manage') as p_jobs,
  has_permission('33333333-3333-4333-8333-333333333301','volunteers.manage') as p_vol,
  has_permission('33333333-3333-4333-8333-333333333301','trivia.manage') as p_trivia,
  has_permission('33333333-3333-4333-8333-333333333301','qa.view') as p_qa_v,
  has_permission('33333333-3333-4333-8333-333333333301','qa.moderate') as p_qa_m,
  (SELECT count(*) FROM events WHERE org_id='22222222-2222-4222-8222-222222222201') as cross_saup;
ROLLBACK;

-- ============================================================
-- BLOCK 8: chamber-owner as Owner @ Chamber
-- ============================================================
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"cfd87e8a-ef45-4ba4-b110-63d7f337804d","role":"authenticated"}';
SELECT
  'chamber-owner' as u, 'chamber' as org, 'Owner' as role,
  has_org_role('33333333-3333-4333-8333-333333333301'::uuid,'staff'::org_role) as hor_staff,
  has_org_role('33333333-3333-4333-8333-333333333301'::uuid,'admin'::org_role) as hor_admin,
  has_org_role('33333333-3333-4333-8333-333333333301'::uuid,'owner'::org_role) as hor_owner,
  has_permission('33333333-3333-4333-8333-333333333301','announcements.manage') as p_ann_view,
  has_permission('33333333-3333-4333-8333-333333333301','announcements.send') as p_ann_send,
  has_permission('33333333-3333-4333-8333-333333333301','event.manage') as p_evt_mgr,
  has_permission('33333333-3333-4333-8333-333333333301','event.tickets') as p_tickets,
  has_permission('33333333-3333-4333-8333-333333333301','agenda.view') as p_agenda_v,
  has_permission('33333333-3333-4333-8333-333333333301','agenda.manage') as p_agenda_m,
  has_permission('33333333-3333-4333-8333-333333333301','checkin.manage') as p_checkin,
  has_permission('33333333-3333-4333-8333-333333333301','speakers.view') as p_spk_v,
  has_permission('33333333-3333-4333-8333-333333333301','speakers.manage') as p_spk_m,
  has_permission('33333333-3333-4333-8333-333333333301','surveys.view') as p_surv_v,
  has_permission('33333333-3333-4333-8333-333333333301','surveys.manage') as p_surv_m,
  has_permission('33333333-3333-4333-8333-333333333301','video.manage') as p_video,
  has_permission('33333333-3333-4333-8333-333333333301','attendees.view') as p_att_v,
  has_permission('33333333-3333-4333-8333-333333333301','attendees.edit') as p_att_e,
  has_permission('33333333-3333-4333-8333-333333333301','attendees.refund') as p_refund,
  has_permission('33333333-3333-4333-8333-333333333301','org.members.invite') as p_mbr,
  has_permission('33333333-3333-4333-8333-333333333301','org.settings') as p_org_set,
  has_permission('33333333-3333-4333-8333-333333333301','org.delete') as p_org_del,
  has_permission('33333333-3333-4333-8333-333333333301','org.audit_log') as p_audit_o,
  has_permission('33333333-3333-4333-8333-333333333301','event.audit_log') as p_audit_e,
  has_permission('33333333-3333-4333-8333-333333333301','failed_jobs.manage') as p_jobs,
  has_permission('33333333-3333-4333-8333-333333333301','volunteers.manage') as p_vol,
  has_permission('33333333-3333-4333-8333-333333333301','trivia.manage') as p_trivia,
  has_permission('33333333-3333-4333-8333-333333333301','qa.view') as p_qa_v,
  has_permission('33333333-3333-4333-8333-333333333301','qa.moderate') as p_qa_m,
  (SELECT count(*) FROM events WHERE org_id='11111111-1111-4111-8111-111111111101') as cross_meridian;
ROLLBACK;

-- ============================================================
-- BLOCK 9: oss-director as Owner @ OpenSource ATL
-- ============================================================
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"3bff4a53-29b6-4643-a1e8-ba092a8747b1","role":"authenticated"}';
SELECT
  'oss-director' as u, 'oss-atl' as org, 'Owner' as role,
  has_org_role('44444444-4444-4444-8444-444444444401'::uuid,'staff'::org_role) as hor_staff,
  has_org_role('44444444-4444-4444-8444-444444444401'::uuid,'admin'::org_role) as hor_admin,
  has_org_role('44444444-4444-4444-8444-444444444401'::uuid,'owner'::org_role) as hor_owner,
  has_permission('44444444-4444-4444-8444-444444444401','announcements.manage') as p_ann_view,
  has_permission('44444444-4444-4444-8444-444444444401','announcements.send') as p_ann_send,
  has_permission('44444444-4444-4444-8444-444444444401','event.manage') as p_evt_mgr,
  has_permission('44444444-4444-4444-8444-444444444401','event.tickets') as p_tickets,
  has_permission('44444444-4444-4444-8444-444444444401','agenda.view') as p_agenda_v,
  has_permission('44444444-4444-4444-8444-444444444401','agenda.manage') as p_agenda_m,
  has_permission('44444444-4444-4444-8444-444444444401','checkin.manage') as p_checkin,
  has_permission('44444444-4444-4444-8444-444444444401','speakers.view') as p_spk_v,
  has_permission('44444444-4444-4444-8444-444444444401','speakers.manage') as p_spk_m,
  has_permission('44444444-4444-4444-8444-444444444401','surveys.view') as p_surv_v,
  has_permission('44444444-4444-4444-8444-444444444401','surveys.manage') as p_surv_m,
  has_permission('44444444-4444-4444-8444-444444444401','video.manage') as p_video,
  has_permission('44444444-4444-4444-8444-444444444401','attendees.view') as p_att_v,
  has_permission('44444444-4444-4444-8444-444444444401','attendees.edit') as p_att_e,
  has_permission('44444444-4444-4444-8444-444444444401','attendees.refund') as p_refund,
  has_permission('44444444-4444-4444-8444-444444444401','org.members.invite') as p_mbr,
  has_permission('44444444-4444-4444-8444-444444444401','org.settings') as p_org_set,
  has_permission('44444444-4444-4444-8444-444444444401','org.delete') as p_org_del,
  has_permission('44444444-4444-4444-8444-444444444401','org.audit_log') as p_audit_o,
  has_permission('44444444-4444-4444-8444-444444444401','event.audit_log') as p_audit_e,
  has_permission('44444444-4444-4444-8444-444444444401','failed_jobs.manage') as p_jobs,
  has_permission('44444444-4444-4444-8444-444444444401','volunteers.manage') as p_vol,
  has_permission('44444444-4444-4444-8444-444444444401','trivia.manage') as p_trivia,
  has_permission('44444444-4444-4444-8444-444444444401','qa.view') as p_qa_v,
  has_permission('44444444-4444-4444-8444-444444444401','qa.moderate') as p_qa_m,
  (SELECT count(*) FROM events WHERE org_id='11111111-1111-4111-8111-111111111101') as cross_meridian;
ROLLBACK;

-- ============================================================
-- BLOCK 10: Cross-tenant non-member probe
-- oss-director accessing orgs they are NOT a member of
-- Expected: all permission functions = false, all sensitive counts = 0
-- ============================================================
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"3bff4a53-29b6-4643-a1e8-ba092a8747b1","role":"authenticated"}';
SELECT
  'oss-director' as u, 'CROSS-TENANT-PROBE' as probe,
  has_org_role('22222222-2222-4222-8222-222222222201'::uuid,'staff'::org_role) as saup_staff,
  has_org_role('11111111-1111-4111-8111-111111111101'::uuid,'staff'::org_role) as meridian_staff,
  has_org_role('33333333-3333-4333-8333-333333333301'::uuid,'staff'::org_role) as chamber_staff,
  -- Sensitive data: all must be 0
  (SELECT count(*) FROM registrations WHERE event_id IN (SELECT id FROM events WHERE org_id='22222222-2222-4222-8222-222222222201')) as saup_regs,
  (SELECT count(*) FROM org_members WHERE org_id='22222222-2222-4222-8222-222222222201') as saup_members,
  (SELECT count(*) FROM audit_logs WHERE org_id='22222222-2222-4222-8222-222222222201') as saup_audit,
  (SELECT count(*) FROM surveys WHERE event_id IN (SELECT id FROM events WHERE org_id='22222222-2222-4222-8222-222222222201')) as saup_surveys,
  (SELECT count(*) FROM announcements WHERE event_id IN (SELECT id FROM events WHERE org_id='22222222-2222-4222-8222-222222222201')) as saup_ann,
  -- Sessions: may be nonzero (published sessions are publicly visible by design)
  (SELECT count(*) FROM sessions WHERE event_id IN (SELECT id FROM events WHERE org_id='22222222-2222-4222-8222-222222222201')) as saup_sessions_public,
  (SELECT count(*) FROM registrations WHERE event_id IN (SELECT id FROM events WHERE org_id='11111111-1111-4111-8111-111111111101')) as meridian_regs,
  (SELECT count(*) FROM org_members WHERE org_id='11111111-1111-4111-8111-111111111101') as meridian_members;
ROLLBACK;
