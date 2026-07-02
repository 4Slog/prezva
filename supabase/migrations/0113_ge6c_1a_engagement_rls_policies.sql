-- GE-6c 1a: owner-scoped RLS policies for attendee social floor
-- community_posts, community_replies, community_upvotes, community_rsvps,
-- community_reports, attendee_follows, meeting_requests
-- Guests (anon, no auth.uid) remain locked out by design.
-- service_role_all policies on each table are retained (not touched).

-- ── community_posts ───────────────────────────────────────────────────────────

drop policy if exists community_posts_select_registrants on public.community_posts;
create policy community_posts_select_registrants on public.community_posts
  for select to public using (is_registered(event_id));

drop policy if exists community_posts_insert_own on public.community_posts;
create policy community_posts_insert_own on public.community_posts
  for insert to public with check (author_id = auth.uid() and is_registered(event_id));

drop policy if exists community_posts_update_own on public.community_posts;
create policy community_posts_update_own on public.community_posts
  for update to public using (author_id = auth.uid()) with check (author_id = auth.uid());

-- ── community_replies ─────────────────────────────────────────────────────────

drop policy if exists community_replies_select_registrants on public.community_replies;
create policy community_replies_select_registrants on public.community_replies
  for select to public using (exists (select 1 from public.community_posts p
    where p.id = community_replies.post_id and is_registered(p.event_id)));

drop policy if exists community_replies_insert_own on public.community_replies;
create policy community_replies_insert_own on public.community_replies
  for insert to public with check (author_id = auth.uid() and exists (select 1
    from public.community_posts p where p.id = community_replies.post_id and is_registered(p.event_id)));

drop policy if exists community_replies_update_own on public.community_replies;
create policy community_replies_update_own on public.community_replies
  for update to public using (author_id = auth.uid()) with check (author_id = auth.uid());

-- ── community_upvotes ─────────────────────────────────────────────────────────

drop policy if exists community_upvotes_select_registrants on public.community_upvotes;
create policy community_upvotes_select_registrants on public.community_upvotes
  for select to public using (exists (select 1 from public.community_posts p
    where p.id = community_upvotes.post_id and is_registered(p.event_id)));

drop policy if exists community_upvotes_insert_own on public.community_upvotes;
create policy community_upvotes_insert_own on public.community_upvotes
  for insert to public with check (user_id = auth.uid() and exists (select 1
    from public.community_posts p where p.id = community_upvotes.post_id and is_registered(p.event_id)));

-- ── community_rsvps ───────────────────────────────────────────────────────────

drop policy if exists community_rsvps_select_registrants on public.community_rsvps;
create policy community_rsvps_select_registrants on public.community_rsvps
  for select to public using (exists (select 1 from public.community_posts p
    where p.id = community_rsvps.post_id and is_registered(p.event_id)));

drop policy if exists community_rsvps_insert_own on public.community_rsvps;
create policy community_rsvps_insert_own on public.community_rsvps
  for insert to public with check (user_id = auth.uid() and exists (select 1
    from public.community_posts p where p.id = community_rsvps.post_id and is_registered(p.event_id)));

-- ── community_reports ─────────────────────────────────────────────────────────

drop policy if exists community_reports_insert_own on public.community_reports;
create policy community_reports_insert_own on public.community_reports
  for insert to public with check (reporter_id = auth.uid());

-- ── attendee_follows ──────────────────────────────────────────────────────────

drop policy if exists attendee_follows_select_bilateral on public.attendee_follows;
create policy attendee_follows_select_bilateral on public.attendee_follows
  for select to public using (follower_id = auth.uid() or followed_id = auth.uid());

drop policy if exists attendee_follows_insert_own on public.attendee_follows;
create policy attendee_follows_insert_own on public.attendee_follows
  for insert to public with check (follower_id = auth.uid() and is_registered(event_id));

drop policy if exists attendee_follows_update_own on public.attendee_follows;
create policy attendee_follows_update_own on public.attendee_follows
  for update to public using (follower_id = auth.uid()) with check (follower_id = auth.uid());

drop policy if exists attendee_follows_delete_own on public.attendee_follows;
create policy attendee_follows_delete_own on public.attendee_follows
  for delete to public using (follower_id = auth.uid());

-- ── meeting_requests ──────────────────────────────────────────────────────────

drop policy if exists meeting_requests_select_bilateral on public.meeting_requests;
create policy meeting_requests_select_bilateral on public.meeting_requests
  for select to public using (requester_id = auth.uid() or recipient_id = auth.uid());

drop policy if exists meeting_requests_insert_own on public.meeting_requests;
create policy meeting_requests_insert_own on public.meeting_requests
  for insert to public with check (requester_id = auth.uid() and is_registered(event_id));

drop policy if exists meeting_requests_update_party on public.meeting_requests;
create policy meeting_requests_update_party on public.meeting_requests
  for update to public using (requester_id = auth.uid() or recipient_id = auth.uid())
  with check (requester_id = auth.uid() or recipient_id = auth.uid());
