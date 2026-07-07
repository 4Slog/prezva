import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyEmbeddedSession, COOKIE_NAME } from '@/lib/embedded/session'
import { embedGetPhotosData } from '@/lib/embedded/engagement-actions'

interface Props {
  params: Promise<{ eventId: string }>
}

export default async function EmbedPhotosPage({ params }: Props) {
  const { eventId } = await params

  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) redirect('/embedded/events')

  try {
    await verifyEmbeddedSession(token)
  } catch {
    redirect('/embedded/events')
  }

  let data: Awaited<ReturnType<typeof embedGetPhotosData>>
  try {
    data = await embedGetPhotosData(eventId)
  } catch {
    redirect('/embedded/events')
  }

  const { count, eventSlug } = data

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold" style={{ color: 'var(--pz-text)' }}>Event Photos</h1>
        <span style={{ fontSize: 13, color: 'var(--pz-muted)' }}>{count} total</span>
      </div>

      <div className="pz-card p-6">
        <p style={{ fontSize: 14, color: 'var(--pz-muted)', marginBottom: 16 }}>
          Attendees can upload photos from the event app. Photos appear in the public gallery at{' '}
          <a href={`/e/${eventSlug}/photos`} style={{ color: 'var(--pz-teal)' }}>prezva.app/e/{eventSlug}/photos</a>.
        </p>
        <div style={{ display: 'flex', gap: 12 }}>
          <a
            href={`/e/${eventSlug}/photos`}
            target="_blank"
            rel="noreferrer"
            style={{ padding: '8px 16px', background: 'var(--pz-teal)', color: 'var(--pz-on-accent)', borderRadius: 6, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}
          >
            View public gallery ↗
          </a>
        </div>
      </div>
    </>
  )
}
