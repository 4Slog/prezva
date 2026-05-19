import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

type Props = { params: Promise<{ slug: string }> }

export default async function OrgProfilePage({ params }: Props) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, slug, logo_url, website, description')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle()
  if (!org) notFound()

  const now = new Date().toISOString()

  const [{ data: upcomingEvents }, { data: pastEvents }] = await Promise.all([
    supabase
      .from('events')
      .select('id, title, slug, start_at, venue_name, venue_city, is_virtual')
      .eq('org_id', (org as any).id)
      .in('status', ['published', 'live'])
      .gt('start_at', now)
      .order('start_at', { ascending: true })
      .limit(6),
    supabase
      .from('events')
      .select('id, title, slug, start_at')
      .eq('org_id', (org as any).id)
      .eq('status', 'ended')
      .order('start_at', { ascending: false })
      .limit(3),
  ])

  const o = org as any

  return (
    <div style={{ minHeight: '100vh', background: 'var(--pz-bg)' }}>
      {/* Header */}
      <div style={{ background: 'var(--pz-surface)', borderBottom: '1px solid var(--pz-border)', padding: '2rem 1.5rem' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 20 }}>
          {o.logo_url ? (
            <img src={o.logo_url} alt={o.name} style={{ width: 64, height: 64, borderRadius: 12, objectFit: 'cover', border: '1px solid var(--pz-border)' }} />
          ) : (
            <div style={{ width: 64, height: 64, borderRadius: 12, background: 'var(--pz-teal)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 900, color: '#0D1B2A', flexShrink: 0 }}>
              {o.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--pz-text)', marginBottom: 4 }}>{o.name}</h1>
            {o.website && (
              <a href={o.website} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: 'var(--pz-teal)', textDecoration: 'none' }}>{o.website}</a>
            )}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '2rem 1.5rem' }}>
        {o.description && (
          <div style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 10, padding: '1.25rem', marginBottom: 28 }}>
            <p style={{ color: 'var(--pz-text)', fontSize: 14, lineHeight: 1.7 }}>{o.description}</p>
          </div>
        )}

        {/* Upcoming events */}
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--pz-text)', marginBottom: 14 }}>Upcoming events</h2>
        {!upcomingEvents || upcomingEvents.length === 0 ? (
          <div style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 10, padding: '2rem', textAlign: 'center', marginBottom: 28 }}>
            <p style={{ color: 'var(--pz-muted)', fontSize: 13 }}>No upcoming events.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
            {upcomingEvents.map((ev: any) => {
              const date = new Date(ev.start_at)
              return (
                <div key={ev.id} style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 10, padding: '1.25rem', display: 'flex', gap: 16, alignItems: 'center' }}>
                  <div style={{ minWidth: 52, textAlign: 'center', background: 'var(--pz-bg)', border: '1px solid var(--pz-border)', borderRadius: 8, padding: '6px 4px', flexShrink: 0 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--pz-teal)', textTransform: 'uppercase', letterSpacing: 1 }}>
                      {date.toLocaleDateString('en-US', { month: 'short' })}
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--pz-text)', lineHeight: 1.1 }}>{date.getDate()}</div>
                    <div style={{ fontSize: 10, color: 'var(--pz-muted)' }}>{date.getFullYear()}</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--pz-text)', marginBottom: 3 }}>{ev.title}</p>
                    <p style={{ fontSize: 12, color: 'var(--pz-muted)' }}>
                      {ev.is_virtual ? 'Virtual' : [ev.venue_name, ev.venue_city].filter(Boolean).join(', ') || 'TBA'}
                    </p>
                  </div>
                  <Link
                    href={`/e/${ev.slug}`}
                    style={{ fontSize: 13, fontWeight: 600, background: 'var(--pz-teal)', color: '#0D1B2A', padding: '8px 16px', borderRadius: 8, textDecoration: 'none', whiteSpace: 'nowrap' }}
                  >
                    Register →
                  </Link>
                </div>
              )
            })}
          </div>
        )}

        {/* Past events */}
        {pastEvents && pastEvents.length > 0 && (
          <>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--pz-text)', marginBottom: 14 }}>Past events</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pastEvents.map((ev: any) => (
                <div key={ev.id} style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 10, padding: '1rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--pz-text)' }}>{ev.title}</p>
                  <p style={{ fontSize: 12, color: 'var(--pz-muted)', flexShrink: 0, marginLeft: 12 }}>
                    {new Date(ev.start_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
