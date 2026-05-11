import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/auth/get-user'
import { PeopleClient } from './people-client'

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ q?: string }> }

export default async function PeoplePage({ params, searchParams }: Props) {
  const { slug } = await params
  const { q } = await searchParams
  const user = await getUser()
  const supabase = await createClient()

  const { data: event } = await supabase
    .from('events')
    .select('id, title')
    .eq('slug', slug)
    .single()
  if (!event) notFound()

  // Fetch initial profiles server-side
  let profileQuery = supabase
    .from('attendee_profiles')
    .select(`
      id, bio, company, job_title, interests, avatar_url, registration_id,
      registrations!inner(attendee_name, ticket_types(name))
    `)
    .eq('event_id', (event as any).id)
    .eq('is_visible', true)
    .limit(20)

  if (q?.trim()) {
    profileQuery = profileQuery.textSearch('fts', q.trim().replace(/\s+/g, ' & '), { type: 'websearch' })
  } else {
    profileQuery = profileQuery.order('created_at', { ascending: true })
  }

  const { data: profiles } = await profileQuery

  const mappedProfiles = ((profiles ?? []) as any[]).map(p => ({
    id: p.id,
    registration_id: p.registration_id,
    name: p.registrations?.attendee_name ?? '',
    company: p.company ?? '',
    job_title: p.job_title ?? '',
    bio: p.bio ?? '',
    interests: p.interests ?? [],
    avatar_url: p.avatar_url ?? null,
    ticket_name: p.registrations?.ticket_types?.name ?? '',
  }))

  return (
    <div style={{ minHeight: '100vh', background: 'var(--pz-bg)' }}>
      <div style={{ background: 'var(--pz-surface)', borderBottom: '1px solid var(--pz-border)', padding: '1.25rem 1.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <a href={`/e/${slug}`} style={{ color: 'var(--pz-teal)', fontSize: 13, textDecoration: 'none' }}>← {(event as any).title}</a>
        </div>
      </div>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem 1.5rem' }}>
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--pz-text)' }}>People</h1>
          <p className="text-sm" style={{ color: 'var(--pz-muted)' }}>
            {mappedProfiles.length} attendee profile{mappedProfiles.length !== 1 ? 's' : ''}
            {q ? ` matching "${q}"` : ''}
          </p>
        </div>
        <PeopleClient
          eventSlug={slug}
          eventId={(event as any).id}
          initialProfiles={mappedProfiles}
          initialQuery={q ?? ''}
          userId={user?.id ?? null}
        />
      </div>
    </div>
  )
}
