import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyEmbeddedSession, COOKIE_NAME } from '@/lib/embedded/session'
import { embedGetNetworkingData } from '@/lib/embedded/engagement-actions'
import NetworkingDirectoryClient from './directory-client'

interface Props {
  params: Promise<{ eventId: string }>
}

export default async function EmbedNetworkingPage({ params }: Props) {
  const { eventId } = await params

  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) redirect('/embedded/events')

  try {
    await verifyEmbeddedSession(token)
  } catch {
    redirect('/embedded/events')
  }

  let data: Awaited<ReturnType<typeof embedGetNetworkingData>>
  try {
    data = await embedGetNetworkingData(eventId)
  } catch {
    redirect('/embedded/events')
  }

  const { attendees } = data

  return (
    <>
      <h1 className="mb-1 text-xl font-bold" style={{ color: 'var(--pz-text)' }}>Networking</h1>
      <p className="mb-6" style={{ fontSize: 13, color: 'var(--pz-muted)' }}>Attendee directory</p>
      <NetworkingDirectoryClient attendees={attendees as any[]} />
    </>
  )
}
