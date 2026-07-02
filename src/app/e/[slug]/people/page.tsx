import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/auth/get-user'
import { getMatchSuggestions } from '@/lib/networking/sprint8-actions'
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

  const eventId = (event as any).id

  let profileQuery = supabase
    .from('event_visible_profiles')
    .select('id, registration_id, attendee_name, company, job_title, bio, interests, avatar_url, ticket_name')
    .eq('event_id', eventId)
    .limit(20)

  if (q?.trim()) {
    const safe = q.trim().replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_').replace(/[,()]/g, '')
    const term = `%${safe}%`
    profileQuery = profileQuery.or(`bio.ilike.${term},company.ilike.${term},job_title.ilike.${term}`)
  } else {
    profileQuery = profileQuery.order('created_at', { ascending: true })
  }

  const { data: profiles } = await profileQuery

  const mappedProfiles = ((profiles ?? []) as any[]).map(p => ({
    id: p.id,
    registration_id: p.registration_id,
    name: p.attendee_name ?? '',
    company: p.company ?? '',
    job_title: p.job_title ?? '',
    bio: p.bio ?? '',
    interests: p.interests ?? [],
    avatar_url: p.avatar_url ?? null,
    ticket_name: p.ticket_name ?? '',
  }))

  // T-091b: Matchmaking — fetch suggestions if user has a profile and not searching
  let suggestions: typeof mappedProfiles = []
  if (user && !q?.trim()) {
    const { data: myReg } = await supabase
      .from('registrations')
      .select('id')
      .eq('event_id', eventId)
      .eq('attendee_email', user.email ?? '')
      .neq('status', 'cancelled')
      .limit(1)
      .single()
    if (myReg) {
      suggestions = (await getMatchSuggestions(eventId, (myReg as any).id)) as typeof mappedProfiles
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--pz-bg)' }}>
      <div style={{ background: 'var(--pz-surface)', borderBottom: '1px solid var(--pz-border)', padding: '1.25rem 1.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <a href={`/e/${slug}`} style={{ color: 'var(--pz-teal)', fontSize: 13, textDecoration: 'none' }}>← {(event as any).title}</a>
          {user && (
            <a href={`/e/${slug}/profile/edit`} style={{ color: 'var(--pz-teal)', fontSize: 13, textDecoration: 'none' }}>Edit my profile →</a>
          )}
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

        {suggestions.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--pz-label)' }}>Suggested connections</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {suggestions.slice(0, 4).map(p => (
                <a
                  key={p.id}
                  href={`/e/${slug}/people/${p.registration_id}`}
                  className="pz-card p-3 hover:opacity-90 transition-opacity"
                  style={{ textDecoration: 'none' }}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <div
                      className="rounded-full shrink-0 flex items-center justify-center text-xs font-semibold"
                      style={{ width: 32, height: 32, background: p.avatar_url ? undefined : 'var(--pz-teal)', color: 'var(--pz-on-accent)', overflow: 'hidden' }}
                    >
                      {p.avatar_url ? <img src={p.avatar_url} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : p.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate" style={{ color: 'var(--pz-text)' }}>{p.name}</p>
                      {(p.job_title || p.company) && (
                        <p className="text-xs truncate" style={{ color: 'var(--pz-muted)' }}>{[p.job_title, p.company].filter(Boolean).join(' · ')}</p>
                      )}
                    </div>
                  </div>
                  {p.interests.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {p.interests.slice(0, 2).map((interest: string) => (
                        <span key={interest} className="rounded-full px-2 py-0.5 text-xs" style={{ background: 'var(--pz-surface-2)', color: 'var(--pz-muted)' }}>
                          {interest}
                        </span>
                      ))}
                    </div>
                  )}
                </a>
              ))}
            </div>
          </div>
        )}

        <PeopleClient
          eventSlug={slug}
          eventId={eventId}
          initialProfiles={mappedProfiles}
          initialQuery={q ?? ''}
          userId={user?.id ?? null}
        />
      </div>
    </div>
  )
}
