-- O152 / F-R7 + F-R12: deleting a profile must never be blocked by, and must
-- never destroy, records the organization keeps.
--
-- F-R12: every foreign key to profiles that had no ON DELETE action becomes
-- ON DELETE SET NULL. With NO ACTION, a user with a linked registration (or a
-- message, a conversation, a speaker row, staff history…) could not be
-- deleted at all: the profile delete failed, auth.admin.deleteUser failed
-- behind it, and the old route still answered success. Five of these columns
-- were NOT NULL, which SET NULL cannot satisfy, so NOT NULL is dropped:
-- announcements.created_by and events.created_by (organization records kept
-- after their staff author leaves), conversations.participant_a/b and
-- messages.sender_id (the delete removes the subject's own conversations and
-- messages first; SET NULL is the backstop).
--
-- F-R7: waiver signatures are KEPT (liability). waiver_signatures.user_id was
-- ON DELETE CASCADE and NOT NULL, so deleting the profile deleted the waiver;
-- it becomes nullable with ON DELETE SET NULL.
--
-- Additive for readers: no existing row changes; nulls appear only after an
-- account is deleted.

ALTER TABLE public.announcements ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.events ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.conversations ALTER COLUMN participant_a DROP NOT NULL;
ALTER TABLE public.conversations ALTER COLUMN participant_b DROP NOT NULL;
ALTER TABLE public.messages ALTER COLUMN sender_id DROP NOT NULL;
ALTER TABLE public.waiver_signatures ALTER COLUMN user_id DROP NOT NULL;

DO $$
DECLARE
  spec record;
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES
      ('organizations',      'organizations_created_by_fkey',      'created_by'),
      ('org_members',        'org_members_invited_by_fkey',        'invited_by'),
      ('events',             'events_created_by_fkey',             'created_by'),
      ('registrations',      'registrations_user_id_fkey',         'user_id'),
      ('registrations',      'registrations_paid_offline_by_fkey', 'paid_offline_by'),
      ('check_ins',          'check_ins_checked_in_by_fkey',       'checked_in_by'),
      ('speakers',           'speakers_user_id_fkey',              'user_id'),
      ('announcements',      'announcements_created_by_fkey',      'created_by'),
      ('conversations',      'conversations_participant_a_fkey',   'participant_a'),
      ('conversations',      'conversations_participant_b_fkey',   'participant_b'),
      ('messages',           'messages_sender_id_fkey',            'sender_id'),
      ('surveys',            'surveys_created_by_fkey',            'created_by'),
      ('org_member_invites', 'org_member_invites_invited_by_fkey', 'invited_by'),
      ('session_documents',  'session_documents_uploaded_by_fkey', 'uploaded_by'),
      ('event_documents',    'event_documents_uploaded_by_fkey',   'uploaded_by'),
      ('waiver_signatures',  'waiver_signatures_user_id_fkey',     'user_id')
    ) AS t(tbl, con, col)
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', spec.tbl, spec.con);
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.profiles(id) ON DELETE SET NULL',
      spec.tbl, spec.con, spec.col
    );
  END LOOP;
END $$;
