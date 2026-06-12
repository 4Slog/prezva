import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyEmbeddedSession, COOKIE_NAME } from '@/lib/embedded/session'
import {
  embedGetRunOfShowData,
  embedUpsertRosItem,
  embedUpdateRosItemStatus,
  embedDeleteRosItem,
  embedImportSessionsToRos,
} from '@/lib/embedded/run-of-show-actions'
import { RunOfShowClient } from '@/app/(dashboard)/events/[slug]/run-of-show/run-of-show-client'

interface Props {
  params: Promise<{ eventId: string }>
}

export default async function EmbedRunOfShowPage({ params }: Props) {
  const { eventId } = await params

  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) redirect('/embedded/events')

  try {
    await verifyEmbeddedSession(token)
  } catch {
    redirect('/embedded/events')
  }

  let data: Awaited<ReturnType<typeof embedGetRunOfShowData>>
  try {
    data = await embedGetRunOfShowData(eventId)
  } catch {
    redirect('/embedded/events')
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--pz-text)' }}>Run of Show</h1>
          <p className="text-sm" style={{ color: 'var(--pz-muted)' }}>{data.event?.title}</p>
        </div>
        {data.event?.mc_token && (
          <a
            href={`${process.env.NEXT_PUBLIC_APP_URL ?? 'https://prezva.app'}/mc/${data.event.mc_token}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium"
            style={{ color: 'var(--pz-teal)' }}
          >
            🎙️ Open MC hub →
          </a>
        )}
      </div>
      <RunOfShowClient
        eventId={eventId}
        initItems={data.rosItems}
        sessions={data.sessions as any}
        embed
        embedActions={{
          upsertItem: embedUpsertRosItem,
          updateStatus: embedUpdateRosItemStatus,
          deleteItem: embedDeleteRosItem,
          importSessions: embedImportSessionsToRos,
        }}
      />
    </div>
  )
}
