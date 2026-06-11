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
} from '@/lib/embedded/speakers-actions'
import { SpeakersOrgClient } from '@/app/(dashboard)/events/[slug]/speakers/speakers-org-client'
import { DayOfInfoSection } from '@/app/(dashboard)/events/[slug]/speakers/day-of-info-section'

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

  let event: any, speakers: any[]
  try {
    const data = await embedGetSpeakersPageData(eventId)
    event = data.event
    speakers = data.speakers
  } catch {
    redirect('/embedded/events')
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--pz-text)' }}>Speakers</h1>
          <p className="text-sm" style={{ color: 'var(--pz-muted)' }}>{event.title}</p>
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
        }}
      />
      <DayOfInfoSection
        eventId={eventId}
        initialValue={event.speaker_day_of_info ?? ''}
        embedAction={embedUpdateSpeakerDayOfInfo}
      />
    </div>
  )
}
