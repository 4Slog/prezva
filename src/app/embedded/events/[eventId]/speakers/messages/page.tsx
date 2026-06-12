import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyEmbeddedSession, COOKIE_NAME } from '@/lib/embedded/session'
import {
  embedGetSpeakerMessagesData,
  embedGetOrCreateSpeakerConversation,
  embedGetSpeakerMessages,
  embedSendSpeakerMessage,
  embedGetSpeakersWithMissingInfo,
} from '@/lib/embedded/speakers-actions'
import { SpeakerMessagesClient } from '@/app/(dashboard)/events/[slug]/speakers/messages/speaker-messages-client'

interface Props {
  params: Promise<{ eventId: string }>
}

export default async function EmbedSpeakerMessagesPage({ params }: Props) {
  const { eventId } = await params

  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) redirect('/embedded/events')

  try {
    await verifyEmbeddedSession(token)
  } catch {
    redirect('/embedded/events')
  }

  let data: Awaited<ReturnType<typeof embedGetSpeakerMessagesData>>
  try {
    data = await embedGetSpeakerMessagesData(eventId)
  } catch {
    redirect('/embedded/events')
  }

  return (
    <SpeakerMessagesClient
      event={data.event}
      conversations={data.conversations}
      speakers={data.speakers}
      eventSlug=""
      embed
      backHref={`/embedded/events/${eventId}/speakers`}
      embedActions={{
        getOrCreateConversation: embedGetOrCreateSpeakerConversation,
        getMessages: embedGetSpeakerMessages,
        sendMessage: embedSendSpeakerMessage,
        getSpeakersWithMissingInfo: embedGetSpeakersWithMissingInfo,
      }}
    />
  )
}
