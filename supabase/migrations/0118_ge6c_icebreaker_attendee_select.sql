create policy "icebreaker_questions_attendee_select"
on public.icebreaker_questions
for select to public
using ( is_registered(event_id) );
