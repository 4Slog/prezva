import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { getEventWaivers, createEventWaiver, deleteEventWaiver } from '@/lib/agenda/sprint6-actions'

type Props = { params: Promise<{ slug: string }> }

export default async function WaiversPage({ params }: Props) {
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
  if (!member) notFound()

  const waivers = await getEventWaivers((event as any).id)

  // Count signatures per waiver
  const waiverId = waivers.map((w: any) => w.id)
  const { data: sigCounts } = waiverId.length > 0
    ? await supabase
        .from('waiver_signatures')
        .select('waiver_id')
        .in('waiver_id', waiverId)
    : { data: [] }

  const sigMap: Record<string, number> = {}
  for (const sig of sigCounts ?? []) {
    sigMap[(sig as any).waiver_id] = (sigMap[(sig as any).waiver_id] ?? 0) + 1
  }

  const inputCls = 'w-full rounded-lg px-3 py-2 text-sm focus:outline-none'
  const inputStyle = { background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', color: 'var(--pz-text)' }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <p className="text-xs mb-1" style={{ color: 'var(--pz-label)' }}>
          <a href={`/events/${slug}`} style={{ color: 'var(--pz-muted)' }}>← {(event as any).title}</a>
        </p>
        <h1 className="text-xl font-bold" style={{ color: 'var(--pz-text)' }}>Waivers</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--pz-muted)' }}>
          Required waivers attendees must sign before access is granted.
        </p>
      </div>

      {/* Create waiver */}
      <div className="pz-card p-5 mb-6">
        <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--pz-text)' }}>Create waiver</h2>
        <form
          action={async (fd: FormData) => {
            'use server'
            await createEventWaiver((event as any).id, {
              title: fd.get('title') as string,
              body: fd.get('body') as string,
              is_required: fd.get('is_required') === 'on',
            })
          }}
          className="space-y-3"
        >
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--pz-muted)' }}>Title</label>
            <input name="title" required placeholder="Photo Release & Liability Waiver" className={inputCls} style={inputStyle} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--pz-muted)' }}>Waiver text</label>
            <textarea
              name="body"
              required
              rows={6}
              placeholder="By attending this event, I agree to..."
              className={inputCls}
              style={inputStyle}
            />
          </div>
          <div>
            <label className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: 'var(--pz-muted)' }}>
              <input type="checkbox" name="is_required" defaultChecked className="rounded accent-[#00BFA6]" />
              Required (blocks check-in until signed)
            </label>
          </div>
          <button
            type="submit"
            className="rounded-lg px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
          >
            Create waiver
          </button>
        </form>
      </div>

      {/* Waiver list */}
      {waivers.length === 0 ? (
        <div className="pz-card p-8 text-center">
          <p className="text-sm" style={{ color: 'var(--pz-muted)' }}>No waivers yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {waivers.map((w: any) => (
            <div key={w.id} className="pz-card p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-medium" style={{ color: 'var(--pz-text)' }}>{w.title}</p>
                    {w.is_required && (
                      <span
                        className="rounded-full px-2 py-0.5 text-xs"
                        style={{ background: 'rgba(239,68,68,0.15)', color: 'var(--pz-error)' }}
                      >
                        Required
                      </span>
                    )}
                  </div>
                  <p className="text-xs" style={{ color: 'var(--pz-muted)' }}>
                    {sigMap[w.id] ?? 0} signature{(sigMap[w.id] ?? 0) !== 1 ? 's' : ''}
                  </p>
                  <p
                    className="text-xs mt-2 line-clamp-2"
                    style={{ color: 'var(--pz-label)' }}
                  >
                    {w.body}
                  </p>
                </div>
                <form
                  action={async () => { 'use server'; await deleteEventWaiver(w.id) }}
                  className="ml-4"
                >
                  <button type="submit" className="text-xs hover:opacity-70" style={{ color: 'var(--pz-error)' }}>
                    Delete
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
