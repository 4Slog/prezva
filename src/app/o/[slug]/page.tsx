import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'

type Props = { params: Promise<{ slug: string }> }

export default async function PublicOrgPage({ params }: Props) {
  const { slug } = await params
  // Admin client: organizations RLS only allows org members. This route is
  // intentionally public, so we bypass RLS and project only safe columns.
  const admin = createAdminClient()

  const { data: org } = await admin
    .from('organizations')
    .select('id, name, slug, logo_url, website, description')
    .eq('slug', slug)
    .maybeSingle()

  if (!org) notFound()

  const now = new Date().toISOString()

  const { data: upcomingEvents } = await admin
    .from('events')
    .select('id, title, slug, start_at, end_at, venue_city, venue_state, event_type, cover_image_url, registration_count, status')
    .eq('org_id', (org as any).id)
    .eq('is_discoverable', true)
    .in('status', ['published', 'live'])
    .gt('start_at', now)
    .order('start_at', { ascending: true })
    .limit(6)

  const { data: pastEvents } = await admin
    .from('events')
    .select('id, title, slug, start_at, venue_city, venue_state, registration_count')
    .eq('org_id', (org as any).id)
    .eq('is_discoverable', true)
    .eq('status', 'ended')
    .lt('start_at', now)
    .order('start_at', { ascending: false })
    .limit(3)

  const upcoming = (upcomingEvents ?? []) as any[]
  const past = (pastEvents ?? []) as any[]

  return (
    <div style={{ minHeight: '100vh', background: 'var(--pz-bg)' }}>
      <div style={{ background: 'var(--pz-surface)', borderBottom: '1px solid var(--pz-border)', padding: '2rem 1.5rem' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
            {(org as any).logo_url ? (
              <img src={(org as any).logo_url} alt={(org as any).name}
                style={{ height: 56, maxWidth: 160, objectFit: 'contain' }} />
            ) : (
              <div style={{
                width: 56, height: 56, borderRadius: 12,
                background: 'var(--pz-teal)22', color: 'var(--pz-teal)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 24, fontWeight: 800
              }}>
                {(org as any).name?.charAt(0) ?? '?'}
              </div>
            )}
            <div>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--pz-text)', margin: 0 }}>
                {(org as any).name}
              </h1>
              {(org as any).website && (
                <a href={(org as any).website} target="_blank" rel="noreferrer"
                  style={{ fontSize: 13, color: 'var(--pz-teal)', textDecoration: 'none' }}>
                  {(org as any).website.replace(/^https?:\/\//, '')} ↗
                </a>
              )}
            </div>
          </div>
          {(org as any).description && (
            <p style={{ fontSize: 14, color: 'var(--pz-muted)', margin: 0, lineHeight: 1.6 }}>
              {(org as any).description}
            </p>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '2rem 1.5rem' }}>

        <section style={{ marginBottom: '2.5rem' }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--pz-muted)',
                       textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }}>
            Upcoming Events {upcoming.length > 0 ? `(${upcoming.length})` : ''}
          </h2>
          {upcoming.length === 0 ? (
            <p style={{ fontSize: 14, color: 'var(--pz-muted)', fontStyle: 'italic' }}>
              No upcoming events at this time. Check back soon.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {upcoming.map((e: any) => (
                <a key={e.id} href={`/e/${e.slug}`}
                  style={{ display: 'block', background: 'var(--pz-surface)', borderRadius: 12,
                           border: '1px solid var(--pz-border)', padding: '1.25rem',
                           textDecoration: 'none', transition: 'border-color 0.15s' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontWeight: 700, fontSize: 16, color: 'var(--pz-text)', margin: '0 0 4px' }}>
                        {e.title}
                      </p>
                      <p style={{ fontSize: 13, color: 'var(--pz-muted)', margin: '0 0 8px' }}>
                        {new Date(e.start_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                        {e.venue_city ? ` · ${e.venue_city}${e.venue_state ? `, ${e.venue_state}` : ''}` : ''}
                        {e.event_type === 'virtual' ? ' · Virtual' : e.event_type === 'hybrid' ? ' · Hybrid' : ''}
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 12, color: 'var(--pz-muted)' }}>
                          {e.registration_count ?? 0} registered
                        </span>
                        {e.status === 'live' && (
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px',
                                         borderRadius: 20, background: '#EF444422', color: 'var(--pz-error)' }}>
                            LIVE NOW
                          </span>
                        )}
                      </div>
                    </div>
                    <span style={{ fontSize: 13, color: 'var(--pz-teal)', fontWeight: 600,
                                   flexShrink: 0, paddingTop: 2 }}>
                      Register →
                    </span>
                  </div>
                </a>
              ))}
            </div>
          )}
        </section>

        {past.length > 0 && (
          <section>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--pz-muted)',
                         textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
              Past Events
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {past.map((e: any) => (
                <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between',
                                         alignItems: 'center', padding: '0.75rem 0',
                                         borderBottom: '1px solid var(--pz-border)' }}>
                  <div>
                    <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--pz-text)', margin: '0 0 2px' }}>
                      {e.title}
                    </p>
                    <p style={{ fontSize: 12, color: 'var(--pz-muted)', margin: 0 }}>
                      {new Date(e.start_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                      {e.venue_city ? ` · ${e.venue_city}` : ''}
                    </p>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--pz-muted)' }}>
                    {e.registration_count ?? 0} attended
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
