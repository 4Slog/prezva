import { createClient } from '@/lib/supabase/server'

type SearchParams = { q?: string; city?: string; category?: string; type?: string; when?: string }
type Props = { searchParams: Promise<SearchParams> }

export default async function DiscoverPage({ searchParams }: Props) {
  const { q, city, category, type, when } = await searchParams
  const supabase = await createClient()

  const now = new Date()
  let query = supabase
    .from('events')
    .select('id, title, slug, start_at, end_at, venue_city, venue_state, event_type, cover_image_url, registration_count, category, tags, organizations(name, logo_url, slug)')
    .eq('is_discoverable', true)
    .in('status', ['published', 'live'])

  if (q?.trim()) {
    query = query.ilike('title', `%${q.trim()}%`)
  }

  if (city?.trim()) {
    query = query.ilike('venue_city', `%${city.trim()}%`)
  }

  if (category?.trim()) {
    query = (query as any).eq('category', category.trim())
  }

  if (type?.trim()) {
    query = (query as any).eq('event_type', type.trim())
  }

  if (when === 'this_week') {
    const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
    query = query.gte('start_at', now.toISOString()).lte('start_at', weekEnd)
  } else if (when === 'this_month') {
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()
    query = query.gte('start_at', now.toISOString()).lte('start_at', monthEnd)
  } else {
    query = query.gt('start_at', now.toISOString())
  }

  const { data: events } = await query
    .order('start_at', { ascending: true })
    .limit(24)

  const results = (events ?? []) as any[]
  const hasFilters = !!(q || city || category || type || when)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--pz-bg)' }}>
      {/* Header */}
      <div style={{ background: 'var(--pz-surface)', borderBottom: '1px solid var(--pz-border)', padding: '2rem 1.5rem' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--pz-text)', margin: '0 0 4px' }}>
            Discover Events
          </h1>
          <p style={{ fontSize: 14, color: 'var(--pz-muted)', margin: '0 0 1.5rem' }}>
            Find professional events, conferences, and workshops near you
          </p>
          {/* Search form */}
          <form method="GET" action="/discover" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input name="q" defaultValue={q ?? ''} placeholder="Search events..."
              style={{ flex: 2, minWidth: 200, padding: '0.625rem 0.875rem', borderRadius: 8, fontSize: 14,
                       border: '1px solid var(--pz-border)', background: 'var(--pz-surface-2)',
                       color: 'var(--pz-text)' }} />
            <input name="city" defaultValue={city ?? ''} placeholder="City..."
              style={{ flex: 1, minWidth: 140, padding: '0.625rem 0.875rem', borderRadius: 8, fontSize: 14,
                       border: '1px solid var(--pz-border)', background: 'var(--pz-surface-2)',
                       color: 'var(--pz-text)' }} />
            <select name="category" defaultValue={category ?? ''}
              style={{ flex: 1, minWidth: 140, padding: '0.625rem 0.875rem', borderRadius: 8, fontSize: 14,
                       border: '1px solid var(--pz-border)', background: 'var(--pz-surface-2)',
                       color: 'var(--pz-text)' }}>
              <option value="">All categories</option>
              <option value="conference">Conference</option>
              <option value="workshop">Workshop</option>
              <option value="webinar">Webinar</option>
              <option value="gala">Gala / Awards</option>
              <option value="training">Training</option>
              <option value="networking">Networking</option>
            </select>
            <select name="type" defaultValue={type ?? ''}
              style={{ flex: 1, minWidth: 120, padding: '0.625rem 0.875rem', borderRadius: 8, fontSize: 14,
                       border: '1px solid var(--pz-border)', background: 'var(--pz-surface-2)',
                       color: 'var(--pz-text)' }}>
              <option value="">All formats</option>
              <option value="in_person">In-person</option>
              <option value="virtual">Virtual</option>
              <option value="hybrid">Hybrid</option>
            </select>
            <select name="when" defaultValue={when ?? ''}
              style={{ flex: 1, minWidth: 120, padding: '0.625rem 0.875rem', borderRadius: 8, fontSize: 14,
                       border: '1px solid var(--pz-border)', background: 'var(--pz-surface-2)',
                       color: 'var(--pz-text)' }}>
              <option value="">Any time</option>
              <option value="this_week">This week</option>
              <option value="this_month">This month</option>
            </select>
            <button type="submit"
              style={{ padding: '0.625rem 1.25rem', borderRadius: 8, border: 'none',
                       background: 'var(--pz-teal)', color: '#0D1B2A',
                       fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
              Search
            </button>
            {hasFilters && (
              <a href="/discover"
                style={{ padding: '0.625rem 1rem', borderRadius: 8, fontSize: 13,
                         border: '1px solid var(--pz-border)', color: 'var(--pz-muted)',
                         textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
                Clear
              </a>
            )}
          </form>
        </div>
      </div>

      {/* Results */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 1.5rem' }}>
        {results.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--pz-muted)' }}>
            <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
              {hasFilters ? 'No events match your search.' : 'No upcoming events yet.'}
            </p>
            {hasFilters && (
              <a href="/discover" style={{ color: 'var(--pz-teal)', textDecoration: 'none', fontSize: 14 }}>
                Clear filters →
              </a>
            )}
          </div>
        ) : (
          <>
            <p style={{ fontSize: 13, color: 'var(--pz-muted)', marginBottom: '1.5rem' }}>
              {results.length} event{results.length !== 1 ? 's' : ''} found
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {results.map((e: any) => (
                <a key={e.id} href={`/e/${e.slug}`}
                  style={{ display: 'block', background: 'var(--pz-surface)', borderRadius: 12,
                           border: '1px solid var(--pz-border)', overflow: 'hidden',
                           textDecoration: 'none' }}>
                  {e.cover_image_url && (
                    <img src={e.cover_image_url} alt={e.title}
                      style={{ width: '100%', height: 140, objectFit: 'cover' }} />
                  )}
                  <div style={{ padding: '1rem' }}>
                    {e.category && (
                      <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                                     color: 'var(--pz-teal)', letterSpacing: '0.05em' }}>
                        {e.category}
                      </span>
                    )}
                    <p style={{ fontWeight: 700, fontSize: 15, color: 'var(--pz-text)',
                                margin: '4px 0 4px' }}>
                      {e.title}
                    </p>
                    <p style={{ fontSize: 12, color: 'var(--pz-muted)', margin: '0 0 8px' }}>
                      {new Date(e.start_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      {e.venue_city ? ` · ${e.venue_city}` : ''}
                      {e.event_type === 'virtual' ? ' · Virtual' : e.event_type === 'hybrid' ? ' · Hybrid' : ''}
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: 'var(--pz-muted)' }}>
                        {(e.organizations as any)?.name ?? ''}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--pz-teal)', fontWeight: 600 }}>
                        {e.registration_count ?? 0} registered
                      </span>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
