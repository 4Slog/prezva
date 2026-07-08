import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyEmbeddedSession, COOKIE_NAME } from '@/lib/embedded/session'
import { embedGetAnnouncementsContext } from '@/lib/embedded/announcements-actions'
import { AnnouncementsClient } from './client'

interface Props {
  params: Promise<{ eventId: string }>
}

export default async function EmbedAnnouncementsPage({ params }: Props) {
  const { eventId } = await params

  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) redirect('/embedded/events')

  try {
    await verifyEmbeddedSession(token)
  } catch {
    redirect('/embedded/events')
  }

  let data: Awaited<ReturnType<typeof embedGetAnnouncementsContext>>
  try {
    data = await embedGetAnnouncementsContext(eventId)
  } catch {
    redirect('/embedded/events')
  }

  return (
    <>
      <h1 className="mb-6 text-xl font-bold" style={{ color: 'var(--pz-text)' }}>Announcements</h1>
      <AnnouncementsClient
        eventTitle={data.eventTitle}
        audienceTag={data.audienceTag}
        ghlContactsUrl={data.ghlContactsUrl}
        lifecycleTags={data.lifecycleTags}
      />
    </>
  )
}
