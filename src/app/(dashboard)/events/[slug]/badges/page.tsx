import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { getOrgBadgeTemplates } from '@/lib/productivity/sprint11-actions'
import { BadgesClient } from './badges-client'
import Link from 'next/link'

type Props = { params: Promise<{ slug: string }> }

export default async function BadgesPage({ params }: Props) {
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

  const { data: eventTemplates } = await supabase
    .from('badge_templates')
    .select('id, name, paper_size, is_template')
    .eq('event_id', (event as any).id)

  const orgTemplates = await getOrgBadgeTemplates((event as any).org_id)

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-[#F0F4F8]">Badge templates</h1>
        <div className="flex items-center gap-3">
          {/* Print all only makes sense once a default template is selected — handled in BadgesClient */}
          <Link
            href={`/events/${slug}/badges/new`}
            className="rounded-lg px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
          >
            + New badge template
          </Link>
        </div>
      </div>

      <BadgesClient
        eventId={(event as any).id}
        orgId={(event as any).org_id}
        eventSlug={slug}
        eventTemplates={(eventTemplates ?? []) as any[]}
        orgTemplates={orgTemplates}
      />
    </div>
  )
}
