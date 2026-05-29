import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/auth/get-user'
import { getLeaderboard } from '@/lib/engagement/sprint10-actions'
import { POINT_VALUES } from '@/lib/engagement/point-values'

type Props = { params: Promise<{ slug: string }> }

export default async function LeaderboardPage({ params }: Props) {
  const { slug } = await params
  const supabase = await createClient()
  const user = await getUser()

  const { data: event } = await supabase
    .from('events').select('id, title, leaderboard_point_config').eq('slug', slug).single()
  if (!event) notFound()

  const leaders = await getLeaderboard((event as any).id)

  // Enrich with registration names
  const userIds = leaders.map(l => l.userId)
  const nameMap: Record<string, string> = {}
  if (userIds.length > 0) {
    const { data: regs } = await supabase
      .from('registrations')
      .select('user_id, attendee_name')
      .eq('event_id', (event as any).id)
      .in('user_id', userIds)
    for (const r of (regs ?? []) as any[]) nameMap[r.user_id] = r.attendee_name
  }

  const medals: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--pz-bg)' }}>
      <div style={{ background: 'var(--pz-teal)', padding: '1.5rem', textAlign: 'center' }}>
        <a href={`/e/${slug}`} style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, textDecoration: 'none', display: 'block', marginBottom: '0.5rem' }}>← {(event as any).title}</a>
        <h1 style={{ color: '#fff', fontWeight: 800, fontSize: '1.5rem', margin: 0 }}>Leaderboard</h1>
      </div>
      <div style={{ maxWidth: 480, margin: '2rem auto', padding: '0 1.5rem' }}>
        {leaders.length === 0 ? (
          <div className="pz-card p-8 text-center">
            <p style={{ color: 'var(--pz-muted)', fontSize: 14 }}>No scores yet. Start participating to earn points!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {leaders.map(l => (
              <div
                key={l.userId}
                className="pz-card p-4 flex items-center gap-4"
                style={{ border: l.userId === user?.id ? '2px solid var(--pz-teal)' : undefined }}
              >
                <span style={{ fontSize: l.rank <= 3 ? 24 : 14, minWidth: 36, textAlign: 'center', fontWeight: 700, color: 'var(--pz-muted)' }}>
                  {medals[l.rank] ?? `#${l.rank}`}
                </span>
                <div className="flex-1 min-w-0">
                  <p style={{ fontWeight: 600, color: 'var(--pz-text)', fontSize: 14 }}>
                    {nameMap[l.userId] ?? 'Attendee'}
                    {l.userId === user?.id && ' (you)'}
                  </p>
                </div>
                <span style={{ fontWeight: 700, color: 'var(--pz-teal)', fontSize: 16 }}>{l.total} pts</span>
              </div>
            ))}
          </div>
        )}

        <div className="pz-card p-4 mt-6">
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--pz-label)', marginBottom: 8 }}>How to earn points</p>
          {(() => {
            const dbConfig = ((event as any).leaderboard_point_config ?? {}) as Record<string, number>
            const cfg = { ...POINT_VALUES, ...dbConfig }
            const labels: Record<string, string> = {
              checkin: 'Check in to the event',
              session_attend: 'Attend a session',
              survey_complete: 'Complete a survey',
              profile_complete: 'Complete your profile',
              community_post: 'Post in community',
              icebreaker: 'Complete an icebreaker',
              passport_visit: 'Visit a passport location',
              trivia_correct: 'Answer trivia correctly',
              photo_upload: 'Upload a photo',
              passport_complete: 'Complete the passport',
            }
            return (
              <ul style={{ fontSize: 12, color: 'var(--pz-muted)', lineHeight: 1.8, listStyle: 'none', padding: 0, margin: 0 }}>
                {Object.entries(cfg).filter(([k]) => labels[k]).map(([k, v]) => (
                  <li key={k}>{labels[k]} — {v} pts</li>
                ))}
              </ul>
            )
          })()}
        </div>
      </div>
    </div>
  )
}
