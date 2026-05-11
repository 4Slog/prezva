import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { getCommunityPosts, getCommunityReports, resolveCommunityReport, deleteCommunityPost } from '@/lib/networking/sprint8-actions'

type Props = { params: Promise<{ slug: string }> }

export default async function DashboardCommunityPage({ params }: Props) {
  const { slug } = await params
  const user = await requireUser()
  const supabase = await createClient()

  const { data: event } = await supabase
    .from('events')
    .select('id, title, org_id')
    .eq('slug', slug)
    .single()
  if (!event) notFound()

  const { data: member } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', (event as any).org_id)
    .eq('user_id', user.id)
    .single()
  if (!member) redirect('/dashboard')

  const eventId = (event as any).id
  const [posts, reports] = await Promise.all([
    getCommunityPosts(eventId),
    getCommunityReports(eventId),
  ])

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--pz-text)' }}>Community Moderation</h1>
        <p className="text-sm" style={{ color: 'var(--pz-muted)' }}>{(event as any).title}</p>
      </div>

      {/* Reports queue */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--pz-label)' }}>
          Pending reports ({(reports as any[]).length})
        </h2>
        {(reports as any[]).length === 0 ? (
          <div className="pz-card p-6 text-center">
            <p className="text-sm" style={{ color: 'var(--pz-muted)' }}>No pending reports.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {(reports as any[]).map((r: any) => (
              <div key={r.id} className="pz-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold mb-1" style={{ color: 'var(--pz-label)' }}>
                      Report: {r.reason}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--pz-muted)' }}>
                      {new Date(r.created_at).toLocaleString()}
                      {r.post_id && ` · Post ID: ${r.post_id.slice(0, 8)}…`}
                    </p>
                  </div>
                  <form
                    action={async () => {
                      'use server'
                      await resolveCommunityReport(r.id)
                    }}
                  >
                    <button
                      type="submit"
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold"
                      style={{ background: 'var(--pz-success)', color: '#fff' }}
                    >
                      Resolve
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* All posts */}
      <div>
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--pz-label)' }}>
          All posts ({(posts as any[]).length})
        </h2>
        {(posts as any[]).length === 0 ? (
          <div className="pz-card p-6 text-center">
            <p className="text-sm" style={{ color: 'var(--pz-muted)' }}>No community posts yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {(posts as any[]).map((p: any) => (
              <div key={p.id} className="pz-card p-3 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: 'var(--pz-surface-2)', color: 'var(--pz-muted)' }}>
                      {p.post_type}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--pz-muted)' }}>{new Date(p.created_at).toLocaleDateString()}</span>
                    <span className="text-xs" style={{ color: 'var(--pz-muted)' }}>▲ {p.upvote_count} · 💬 {p.reply_count}</span>
                  </div>
                  <p className="text-sm truncate" style={{ color: 'var(--pz-text)' }}>
                    {p.body || p.og_title || p.article_url || '(no body)'}
                  </p>
                </div>
                <form
                  action={async () => {
                    'use server'
                    await deleteCommunityPost(p.id)
                  }}
                >
                  <button
                    type="submit"
                    className="rounded-lg px-3 py-1.5 text-xs shrink-0"
                    style={{ background: 'var(--pz-surface-2)', color: 'var(--pz-muted)' }}
                  >
                    Delete
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
