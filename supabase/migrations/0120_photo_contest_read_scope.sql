DROP POLICY IF EXISTS "photo_contest_entries_read_public" ON public.photo_contest_entries;
CREATE POLICY "photo_contest_entries_attendee_select" ON public.photo_contest_entries
  FOR SELECT USING (is_registered(event_id));

DROP POLICY IF EXISTS "photo_contest_votes_read_public" ON public.photo_contest_votes;
CREATE POLICY "photo_contest_votes_attendee_select" ON public.photo_contest_votes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.photo_contest_entries e
      WHERE e.id = photo_contest_votes.entry_id
        AND is_registered(e.event_id)
    )
  );
