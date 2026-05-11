import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { getBadgeTemplates, seedPrebuiltTemplates, deleteBadgeTemplate } from '@/lib/checkin/sprint7-actions'
import { BadgeDesigner } from './badge-designer'

type Props = { params: Promise<{ slug: string }> }

export default async function BadgesPage({ params }: Props) {
  const { slug } = await params
  const user = await requireUser()
  const supabase = await createClient()

  const { data: event } = await supabase
    .from('events').select('id, title, org_id').eq('slug', slug).single()
  if (!event) notFound()

  const { data: member } = await supabase
    .from('org_members').select('role')
    .eq('org_id', (event as any).org_id).eq('user_id', user.id).single()
  if (!member) notFound()

  const templates = await getBadgeTemplates((event as any).id)

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <p className="text-xs mb-1" style={{ color: 'var(--pz-muted)' }}>
          <a href={`/events/${slug}`} style={{ color: 'var(--pz-muted)' }}>← {(event as any).title}</a>
        </p>
        <h1 className="text-xl font-bold" style={{ color: 'var(--pz-text)' }}>Badge Designer</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--pz-muted)' }}>
          Design and print attendee badges. Each template can be printed individually or in bulk.
        </p>
      </div>

      {/* Seed prebuilt templates */}
      {templates.length === 0 && (
        <div className="pz-card p-6 mb-6 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--pz-text)' }}>Start with prebuilt templates</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--pz-muted)' }}>5 ready-to-use badge layouts (name badge, professional, speaker, VIP, minimal QR)</p>
          </div>
          <form action={async () => {
            'use server'
            await seedPrebuiltTemplates((event as any).id)
          }}>
            <button
              type="submit"
              className="rounded-lg px-4 py-2 text-sm font-semibold shrink-0 ml-4"
              style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
            >
              Load templates
            </button>
          </form>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Template list */}
        <div className="lg:w-64 shrink-0">
          <div className="pz-card p-4 mb-4">
            <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--pz-text)' }}>Templates</h2>
            {templates.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--pz-muted)' }}>No templates yet.</p>
            ) : (
              <div className="space-y-1">
                {templates.map(t => (
                  <div key={t.id} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: 'var(--pz-surface-2)' }}>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--pz-text)' }}>{t.name}</p>
                      <p className="text-xs" style={{ color: 'var(--pz-muted)' }}>{PAPER_SIZE_LABELS[t.paper_size] ?? t.paper_size}</p>
                    </div>
                    <div className="flex items-center gap-1 ml-2 shrink-0">
                      <a
                        href={`/api/badges/${t.id}/print?event=${(event as any).id}`}
                        target="_blank"
                        className="text-xs hover:opacity-70"
                        style={{ color: 'var(--pz-teal)' }}
                        title="Print preview"
                      >
                        Print
                      </a>
                      <form action={async () => {
                        'use server'
                        await deleteBadgeTemplate(t.id)
                      }} className="ml-1">
                        <button type="submit" className="text-xs hover:opacity-70" style={{ color: 'var(--pz-error)' }}>✕</button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Designer */}
        <div className="flex-1 min-w-0">
          <BadgeDesigner eventId={(event as any).id} />
        </div>
      </div>
    </div>
  )
}

const PAPER_SIZE_LABELS: Record<string, string> = {
  badge_4x3: '4″ × 3″ Badge',
  badge_4x6: '4″ × 6″ Badge',
  avery_5160: 'Avery 5160',
  letter: 'Letter',
  a4: 'A4',
}
