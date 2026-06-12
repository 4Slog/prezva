import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyEmbeddedSession, COOKIE_NAME } from '@/lib/embedded/session'
import {
  embedGetSpeakersPageData,
  embedCreateSpeaker,
  embedUpdateSpeaker,
  embedDeleteSpeaker,
  embedMarkSpeakerArrived,
  embedUpdateSpeakerDayOfInfo,
  embedGetOrgSpeakerLibrary,
  embedAddSpeakerFromLibrary,
  embedSendSpeakerInvite,
  embedRenewSpeakerToken,
  embedGetQAQuestions,
  embedModerateQAQuestion,
} from '@/lib/embedded/speakers-actions'
import { SpeakersOrgClient } from '@/app/(dashboard)/events/[slug]/speakers/speakers-org-client'
import { DayOfInfoSection } from '@/app/(dashboard)/events/[slug]/speakers/day-of-info-section'
import { QAModerationClient } from '@/app/(dashboard)/events/[slug]/speakers/qa-moderation-client'

interface Props {
  params: Promise<{ eventId: string }>
}

export default async function EmbedSpeakersPage({ params }: Props) {
  const { eventId } = await params

  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) redirect('/embedded/events')

  try {
    await verifyEmbeddedSession(token)
  } catch {
    redirect('/embedded/events')
  }

  let event: any, speakers: any[], qaQuestions: any[]
  try {
    const data = await embedGetSpeakersPageData(eventId)
    event = data.event
    speakers = data.speakers
    qaQuestions = await embedGetQAQuestions(eventId)
  } catch {
    redirect('/embedded/events')
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--pz-text)' }}>Speakers</h1>
          <p className="text-sm" style={{ color: 'var(--pz-muted)' }}>{event.title}</p>
        </div>
        <div className="flex items-center gap-4">
          <a
            href={`/embedded/events/${eventId}/speakers/messages`}
            className="text-sm font-medium"
            style={{ color: 'var(--pz-teal)' }}
          >
            Messages →
          </a>
          <a
            href={`/embedded/events/${eventId}/speakers/form`}
            className="text-sm font-medium"
            style={{ color: 'var(--pz-teal)' }}
          >
            Speaker form →
          </a>
        </div>
      </div>
      <SpeakersOrgClient
        event={event}
        speakers={speakers}
        permissions={['speakers.manage']}
        embed
        embedActions={{
          createSpeaker: embedCreateSpeaker,
          markSpeakerArrived: embedMarkSpeakerArrived,
          updateSpeaker: embedUpdateSpeaker,
          deleteSpeaker: embedDeleteSpeaker,
          getOrgSpeakerLibrary: embedGetOrgSpeakerLibrary,
          addSpeakerFromLibrary: embedAddSpeakerFromLibrary,
          sendSpeakerInvite: embedSendSpeakerInvite,
          renewSpeakerToken: embedRenewSpeakerToken,
        }}
      />
      <DayOfInfoSection
        eventId={eventId}
        initialValue={event.speaker_day_of_info ?? ''}
        embedAction={embedUpdateSpeakerDayOfInfo}
      />
      <div className="mt-8">
        <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--pz-text)' }}>Q&amp;A Moderation</h2>
        <QAModerationClient
          eventId={eventId}
          initialQuestions={qaQuestions}
          embedAction={embedModerateQAQuestion}
        />
      </div>
    </>
  )
}
