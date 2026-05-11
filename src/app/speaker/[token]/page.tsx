import { notFound } from 'next/navigation'
import { validateSpeakerToken, getSpeakerSessionsWithQA, getSpeakerFormSchema, getSpeakerFormSubmission, getSessionHandouts } from '@/lib/speaker/speaker-actions'
import { createClient } from '@/lib/supabase/server'
import { SpeakerHubClient } from './speaker-hub-client'

type Props = { params: Promise<{ token: string }> }

export default async function SpeakerHubPage({ params }: Props) {
  const { token } = await params
  const tokenData = await validateSpeakerToken(token)
  if (!tokenData) notFound()

  const { event_id: eventId, speaker_id: speakerId } = tokenData
  const supabase = await createClient()

  const { data: event } = await supabase
    .from('events')
    .select('id, title, slug, start_date, end_date')
    .eq('id', eventId)
    .single()

  const { data: speaker } = await supabase
    .from('speakers')
    .select('id, name, email, bio, photo_url, job_title, company, status, confirmed_at')
    .eq('id', speakerId)
    .single()

  const [sessionData, formSchema, formSubmission] = await Promise.all([
    getSpeakerSessionsWithQA(speakerId, eventId),
    getSpeakerFormSchema(eventId),
    getSpeakerFormSubmission(eventId, speakerId),
  ])

  const sessionsWithHandouts = await Promise.all(
    sessionData.map(async (sd: any) => ({
      ...sd,
      handouts: await getSessionHandouts(sd.session?.id),
    }))
  )

  return (
    <SpeakerHubClient
      token={token}
      event={event as any}
      speaker={speaker as any}
      sessionsWithQA={sessionsWithHandouts}
      formSchema={formSchema}
      formSubmission={formSubmission}
    />
  )
}
