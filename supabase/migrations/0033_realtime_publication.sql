-- B2-6: Enable Supabase Realtime for live feature tables
-- REPLICA IDENTITY FULL is required so that UPDATE and DELETE events include the full old row
-- without it, only INSERT events work correctly in Realtime

ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.group_messages REPLICA IDENTITY FULL;
ALTER TABLE public.community_posts REPLICA IDENTITY FULL;
ALTER TABLE public.speaker_messages REPLICA IDENTITY FULL;
ALTER TABLE public.session_messages REPLICA IDENTITY FULL;
ALTER TABLE public.session_questions REPLICA IDENTITY FULL;

-- Add all live tables to the supabase_realtime publication
-- supabase_realtime is the default publication created by Supabase for Realtime subscriptions
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_posts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.speaker_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.session_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.session_questions;
