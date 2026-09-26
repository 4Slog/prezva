-- O156 + O163 / G-R7: account deletion keeps the other people's group chats.
--
-- The group tables reference auth.users with no ON DELETE action, and two of
-- those columns are NOT NULL, so:
--   * group_conversations.created_by blocked deleting anyone who ever created
--     a group (Batch F refused them up front);
--   * group_messages.sender_id could not be kept as "[deleted]" — the only
--     option was deleting the message from everyone's copy of the thread.
--
-- Now:
--   group_conversations.created_by   nullable, ON DELETE SET NULL
--   group_messages.sender_id         nullable, ON DELETE SET NULL
--   group_conversation_members.user_id  ON DELETE CASCADE (a deleted user
--                                        leaves the group)
-- The delete registry does this explicitly (null creator, "[deleted]" body,
-- membership removed, empty group removed); these rules are the backstop.
--
-- Additive: no row changes; the app works before and after. A null creator
-- still blocks adding members (sprint8-group-actions: created_by !== user.id).

ALTER TABLE public.group_conversations ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.group_messages ALTER COLUMN sender_id DROP NOT NULL;

ALTER TABLE public.group_conversations DROP CONSTRAINT IF EXISTS group_conversations_created_by_fkey;
ALTER TABLE public.group_conversations
  ADD CONSTRAINT group_conversations_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.group_messages DROP CONSTRAINT IF EXISTS group_messages_sender_id_fkey;
ALTER TABLE public.group_messages
  ADD CONSTRAINT group_messages_sender_id_fkey
  FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.group_conversation_members DROP CONSTRAINT IF EXISTS group_conversation_members_user_id_fkey;
ALTER TABLE public.group_conversation_members
  ADD CONSTRAINT group_conversation_members_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
