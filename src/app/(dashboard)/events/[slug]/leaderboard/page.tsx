import { requireUser } from '@/lib/auth/get-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { POINT_VALUES } from '@/lib/engagement/point-values'
import { PointConfigEditor } from '@/components/leaderboard/PointConfigEditor'
import Link from 'next/link'

type Props = { params: Promise<{ slug: string }> }

export default async function EventLeaderboardAdminPage({ params }: Props) {
  const { slug } = await params
  await requireUser()

  // Admin client: fetch top 10 points for admin view
  const admin = createAdminClient()
  const { data: event } = await admin
    .from('events')
    .select('id, title, leaderboard_point_config')
    .eq('slug', slug)
    .maybeSingle()

  const { data: leaders } = event ? await admin
    .from('attendee_points')
    .select('user_id, total_points, registrations(attendee_name, attendee_email)')
    .eq('event_id', event.id)
    .order('total_points', { ascending: false })
    .limit(20) : { data: [] }

  // Merge DB config over POINT_VALUES defaults
  const dbConfig = (event?.leaderboard_point_config ?? {}) as Record<string, number>
  const mergedConfig: Record<string, number> = { ...POINT_VALUES, ...dbConfig }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Link href={`/events/${slug}`} style={{ color: 'var(--pz-teal)', fontSize: 13, textDecoration: 'none' }}>
          ← {event?.title ?? slug}
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

      {(!leaders || leaders.length === 0) ? (
        <div className="pz-card p-6">
          <p style={{ fontSize: 14, color: 'var(--pz-muted)' }}>
            No points recorded yet. Attendees earn points by checking in, attending sessions, submitting surveys, and engaging with the community feed.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(leaders as any[]).map((l, i) => {
            const reg = l.registrations
            const name = reg?.attendee_name ?? reg?.attendee_email ?? 'Attendee'
            return (
              <div key={l.user_id} className="pz-card p-4" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 28, height: 28, borderRadius: '50%', background: i < 3 ? 'var(--pz-teal)' : 'var(--pz-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: i < 3 ? '#0D1B2A' : 'var(--pz-muted)', flexShrink: 0 }}>
                  {i + 1}
                </span>
                <span style={{ flex: 1, fontSize: 14, color: 'var(--pz-text)' }}>{name}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--pz-teal)' }}>{l.total_points} pts</span>
              </div>
            )
          })}
        </div>
      )}

      {event && (
        <PointConfigEditor eventId={event.id} initialConfig={mergedConfig} />
      )}
    </div>
  )
}
