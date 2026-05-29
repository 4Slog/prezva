import { requireEventOrgAccess } from '@/lib/auth/require-event-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { POINT_VALUES } from '@/lib/engagement/point-values'
import { getLeaderboard } from '@/lib/engagement/sprint10-actions'
import { PointConfigEditor } from '@/components/leaderboard/PointConfigEditor'
import Link from 'next/link'

type Props = { params: Promise<{ slug: string }> }

export default async function EventLeaderboardAdminPage({ params }: Props) {
  const { slug } = await params
  const { event } = await requireEventOrgAccess(slug)
  const admin = createAdminClient()

  const { data: eventConfig } = await admin
    .from('events')
    .select('leaderboard_point_config')
    .eq('id', event.id)
    .single()

  const leaders = await getLeaderboard(event.id)

  const nameMap: Record<string, string> = {}
  if (leaders.length > 0) {
    const { data: regs } = await admin
      .from('registrations')
      .select('user_id, attendee_name, attendee_email')
      .eq('event_id', event.id)
      .in('user_id', leaders.map(l => l.userId))
    for (const r of (regs ?? []) as any[]) {
      nameMap[r.user_id] = r.attendee_name ?? r.attendee_email ?? 'Attendee'
    }
  }

  const dbConfig = ((eventConfig as any)?.leaderboard_point_config ?? {}) as Record<string, number>
  const mergedConfig: Record<string, number> = { ...POINT_VALUES, ...dbConfig }
  const medals: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Link href={`/events/${slug}`} style={{ color: 'var(--pz-teal)', fontSize: 13, textDecoration: 'none' }}>
          ← {event.title}
        </Link>
        <span style={{ color: 'var(--pz-border)' }}>/</span>
        <span style={{ fontSize: 13, color: 'var(--pz-text)' }}>Leaderboard</span>
      </div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-[#F0F4F8]">Leaderboard</h1>
        <Link href={`/e/${slug}/leaderboard`} target="_blank" style={{ fontSize: 13, color: 'var(--pz-teal)', textDecoration: 'none' }}>
          View public ↗
        </Link>
      </div>
      {leaders.length === 0 ? (
        <div className="pz-card p-6">
          <p style={{ fontSize: 14, color: 'var(--pz-muted)' }}>
            No points recorded yet. Attendees earn points by checking in, attending sessions, submitting surveys, and engaging with the community feed.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {leaders.map((l, i) => (
            <div key={l.userId} className="pz-card p-4" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 28, height: 28, borderRadius: '50%', background: i < 3 ? 'var(--pz-teal)' : 'var(--pz-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: i < 3 ? '#0D1B2A' : 'var(--pz-muted)', flexShrink: 0 }}>
                {medals[l.rank] ?? l.rank}
              </span>
              <span style={{ flex: 1, fontSize: 14, color: 'var(--pz-text)' }}>{nameMap[l.userId] ?? 'Attendee'}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--pz-teal)' }}>{l.total} pts</span>
            </div>
          ))}
        </div>
      )}
      <PointConfigEditor eventId={event.id} initialConfig={mergedConfig} />
    </div>
  )
}
