import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { SpeakersOrgClient } from './speakers-org-client'

type Props = { params: Promise<{ slug: string }> }

export default async function SpeakersDashboardPage({ params }: Props) {
  const { slug } = await params
  const user = await requireUser()
  const supabase = await createClient()

  const { data: event } = await supabase
    .from('events')
    .select('id, title, org_id, slug')
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

  const { data: speakers } = await supabase
    .from('speakers')
    .select('id, name, email, bio, photo_url, job_title, company, status, confirmed_at, confirmation_token, is_published')
    .eq('event_id', (event as any).id)
    .order('sort_order', { ascending: true })

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--pz-text)' }}>Speakers</h1>
          <p className="text-sm" style={{ color: 'var(--pz-muted)' }}>{(event as any).title}</p>
        </div>
        <a
          href={`/dashboard/events/${slug}/speakers/messages`}
          className="rounded-lg px-4 py-2 text-sm font-medium"
          style={{ background: 'var(--pz-surface-2)', color: 'var(--pz-text)' }}
        >
          Messages
        </a>
      </div>
      <SpeakersOrgClient
        event={event as any}
        speakers={(speakers ?? []) as any[]}
      />
    </div>
  )
}
