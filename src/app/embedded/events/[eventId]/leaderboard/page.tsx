import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyEmbeddedSession, COOKIE_NAME } from '@/lib/embedded/session'
import {
  embedGetLeaderboardData,
  embedUpdateLeaderboardPointConfig,
} from '@/lib/embedded/engagement-actions'
import { PointConfigEditor } from '@/components/leaderboard/PointConfigEditor'

interface Props {
  params: Promise<{ eventId: string }>
}

const medals: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

export default async function EmbedLeaderboardPage({ params }: Props) {
  const { eventId } = await params

  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) redirect('/embedded/events')

  try {
    await verifyEmbeddedSession(token)
  } catch {
    redirect('/embedded/events')
  }

  let data: Awaited<ReturnType<typeof embedGetLeaderboardData>>
  try {
    data = await embedGetLeaderboardData(eventId)
  } catch {
    redirect('/embedded/events')
  }

  const { eventSlug, leaders, nameMap, mergedConfig } = data

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold" style={{ color: 'var(--pz-text)' }}>Leaderboard</h1>
        <a
          href={`/e/${eventSlug}/leaderboard`}
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: 13, color: 'var(--pz-teal)', textDecoration: 'none' }}
        >
          View public ↗
        </a>
      </div>

      {leaders.length === 0 ? (
        <div className="pz-card p-6">
          <p style={{ fontSize: 14, color: 'var(--pz-muted)' }}>
            No points recorded yet. Attendees earn points by checking in, attending sessions, submitting surveys, and engaging with the community feed.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {leaders.map((l) => (
            <div key={l.userId} className="pz-card p-4" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: l.rank <= 3 ? 'var(--pz-teal)' : 'var(--pz-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 700,
                  color: l.rank <= 3 ? 'var(--pz-on-accent)' : 'var(--pz-muted)',
                  flexShrink: 0,
                }}
              >
                {medals[l.rank] ?? l.rank}
              </span>
              <span style={{ flex: 1, fontSize: 14, color: 'var(--pz-text)' }}>{nameMap[l.userId] ?? 'Attendee'}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--pz-teal)' }}>{l.total} pts</span>
            </div>
          ))}
        </div>
      )}

      <PointConfigEditor
        eventId={eventId}
        initialConfig={mergedConfig}
        saveAction={embedUpdateLeaderboardPointConfig}
      />
    </>
  )
}
