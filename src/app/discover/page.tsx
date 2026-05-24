import { createClient } from '@/lib/supabase/server'
import { Suspense } from 'react'
import { NearMeButton } from '@/components/discover/NearMeButton'

type SearchParams = {
  q?: string; city?: string; category?: string; type?: string; when?: string
  lat?: string; lng?: string; radius?: string; view?: string
}
type Props = { searchParams: Promise<SearchParams> }

export default async function DiscoverPage({ searchParams }: Props) {
  const { q, city, category, type, when, lat, lng, radius, view } = await searchParams
  const supabase = await createClient()

  const now = new Date()
  let query = supabase
    .from('events')
    .select('id, title, slug, start_at, end_at, venue_city, venue_state, event_type, cover_image_url, registration_count, category, tags, venue_lat, venue_lng, organizations(name, logo_url, slug)')
    .eq('is_discoverable', true)
    .in('status', ['published', 'live'])

  if (q?.trim()) {
    query = query.ilike('title', `%${q.trim()}%`)
  }

  if (lat && lng) {
    const latF = parseFloat(lat)
    const lngF = parseFloat(lng)
    const radiusMiles = parseFloat(radius ?? '50')
    const latDelta = radiusMiles / 69.0
    const lngDelta = radiusMiles / (69.0 * Math.cos(latF * Math.PI / 180))
    query = query
      .gte('venue_lat', latF - latDelta)
      .lte('venue_lat', latF + latDelta)
      .gte('venue_lng', lngF - lngDelta)
      .lte('venue_lng', lngF + lngDelta)
      .not('venue_lat', 'is', null)
      .not('venue_lng', 'is', null)
  } else if (city?.trim()) {
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
  const hasFilters = !!(q || city || category || type || when || lat)

  // Personalized recommendations — only when no filters and user is logged in
  let recommendations: any[] = []
  let recommendationReason = ''
  if (!hasFilters) {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: pastRegs } = await supabase
        .from('registrations')
        .select('event_id, events(category, org_id, event_type)')
        .eq('user_id', user.id)
        .in('status', ['confirmed', 'checked_in'])
        .order('created_at', { ascending: false })
        .limit(20)

      const regs = (pastRegs ?? []) as any[]
      const registeredEventIds = regs.map((r: any) => r.event_id).filter(Boolean)
      const orgIds: string[] = []
      const categoryCounts: Record<string, number> = {}

      for (const r of regs) {
        const ev = r.events as any
        if (ev?.org_id) orgIds.push(ev.org_id)
        if (ev?.category) categoryCounts[ev.category] = (categoryCounts[ev.category] ?? 0) + 1
      }

      const uniqueOrgIds = [...new Set(orgIds)]
      const topCategory = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0]?.[0]

      const baseRecQuery = () => {
        let q2 = supabase
          .from('events')
          .select('id, title, slug, start_at, venue_city, event_type, cover_image_url, registration_count, category, organizations(name, logo_url, slug)')
          .eq('is_discoverable', true)
          .in('status', ['published', 'live'])
          .gt('start_at', now.toISOString())
          .limit(3)
        if (registeredEventIds.length > 0) {
          q2 = q2.not('id', 'in', `(${registeredEventIds.map(id => `"${id}"`).join(',')})`)
        }
        return q2
      }

      if (uniqueOrgIds.length > 0) {
        const { data: orgRecs } = await baseRecQuery().in('org_id', uniqueOrgIds)
        if ((orgRecs ?? []).length > 0) {
          recommendations = orgRecs as any[]
          recommendationReason = 'From organizations you have attended'
        }
      }

      if (recommendations.length === 0 && topCategory) {
        const { data: catRecs } = await baseRecQuery().eq('category', topCategory)
        if ((catRecs ?? []).length > 0) {
          recommendations = catRecs as any[]
          recommendationReason = `More ${topCategory} events you might like`
        }
      }
    }
  }

  // Build currentParams for toggle links (only defined non-empty values)
  const paramEntries: Record<string, string> = {}
  if (q) paramEntries.q = q
  if (city) paramEntries.city = city
  if (category) paramEntries.category = category
  if (type) paramEntries.type = type
  if (when) paramEntries.when = when
  if (lat) paramEntries.lat = lat
  if (lng) paramEntries.lng = lng
  if (radius) paramEntries.radius = radius
  // view excluded intentionally — toggled below

  const listParams = new URLSearchParams({ ...paramEntries }).toString()
  const mapParams = new URLSearchParams({ ...paramEntries, view: 'map' }).toString()

  const isMapView = view === 'map'

  // City-grouped layout for map view
  const cityGroups: Record<string, any[]> = {}
  if (isMapView) {
    for (const e of results) {
      const key = e.venue_city ?? 'Unknown'
      if (!cityGroups[key]) cityGroups[key] = []
      cityGroups[key].push(e)
    }
  }

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
            <Suspense fallback={<div style={{ width: 120 }} />}>
              <NearMeButton />
            </Suspense>
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
            {/* View toggle */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <p style={{ fontSize: 13, color: 'var(--pz-muted)', margin: 0 }}>
                {results.length} event{results.length !== 1 ? 's' : ''} found
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <a href={`/discover${listParams ? '?' + listParams : ''}`}
                  style={{ padding: '0.375rem 0.875rem', borderRadius: 6, fontSize: 13,
                           border: '1px solid var(--pz-border)', textDecoration: 'none',
                           background: !isMapView ? 'var(--pz-teal)' : 'transparent',
                           color: !isMapView ? '#0D1B2A' : 'var(--pz-muted)',
                           fontWeight: !isMapView ? 700 : 400 }}>
                  List
                </a>
                <a href={`/discover?${mapParams}`}
                  style={{ padding: '0.375rem 0.875rem', borderRadius: 6, fontSize: 13,
                           border: '1px solid var(--pz-border)', textDecoration: 'none',
                           background: isMapView ? 'var(--pz-teal)' : 'transparent',
                           color: isMapView ? '#0D1B2A' : 'var(--pz-muted)',
                           fontWeight: isMapView ? 700 : 400 }}>
                  Map
                </a>
              </div>
            </div>

            {/* Personalized recommendations */}
            {!isMapView && recommendations.length > 0 && (
              <>
                <div style={{ marginBottom: '1.5rem' }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--pz-teal)', textTransform: 'uppercase',
                               letterSpacing: '0.05em', margin: '0 0 0.75rem' }}>
                    {recommendationReason}
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                    {recommendations.map((e: any) => (
                      <a key={e.id} href={`/e/${e.slug}`}
                        style={{ display: 'block', background: 'var(--pz-surface)', borderRadius: 12,
                                 border: '1px solid var(--pz-teal)44', overflow: 'hidden',
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
                          <p style={{ fontWeight: 700, fontSize: 15, color: 'var(--pz-text)', margin: '4px 0 4px' }}>
                            {e.title}
                          </p>
                          <p style={{ fontSize: 12, color: 'var(--pz-muted)', margin: '0 0 8px' }}>
                            {new Date(e.start_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            {e.venue_city ? ` · ${e.venue_city}` : ''}
                          </p>
                          <span style={{ fontSize: 12, color: 'var(--pz-muted)' }}>
                            {(e.organizations as any)?.name ?? ''}
                          </span>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
                <hr style={{ border: 'none', borderTop: '1px solid var(--pz-border)', margin: '0 0 1.5rem' }} />
              </>
            )}

            {isMapView ? (
              /* City-grouped map view */
              <div>
                {Object.entries(cityGroups).map(([cityName, cityEvents]) => (
                  <div key={cityName} style={{ marginBottom: '2rem' }}>
                    <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--pz-text)', margin: '0 0 0.75rem',
                                 display: 'flex', alignItems: 'center', gap: 8 }}>
                      {cityName}
                      <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--pz-muted)' }}>
                        ({cityEvents.length} event{cityEvents.length !== 1 ? 's' : ''})
                      </span>
                    </h2>
                    <div style={{ border: '1px solid var(--pz-border)', borderRadius: 8, overflow: 'hidden' }}>
                      {cityEvents.map((e: any, idx: number) => (
                        <a key={e.id} href={`/e/${e.slug}`}
                          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                   padding: '0.75rem 1rem', textDecoration: 'none',
                                   background: 'var(--pz-surface)',
                                   borderTop: idx > 0 ? '1px solid var(--pz-border)' : 'none' }}>
                          <span style={{ fontSize: 14, color: 'var(--pz-text)', fontWeight: 500 }}>{e.title}</span>
                          <span style={{ fontSize: 12, color: 'var(--pz-muted)', whiteSpace: 'nowrap', marginLeft: 16 }}>
                            {new Date(e.start_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                        </a>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* Default grid view */
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
            )}
          </>
        )}
      </div>
    </div>
  )
}
