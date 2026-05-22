import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

type RolePill =
  | { type: 'attendee'; status: string; regId: string; eventSlug: string }
  | { type: 'speaker'; speakerRole: string | null; token: string }
  | { type: 'volunteer'; role: string | null; token: string }

interface EventEntry {
  id: string
  title: string
  slug: string
  start_at: string | null
  end_at: string | null
  status: string | null
  roles: RolePill[]
}

function StatusBadge({ status }: { status: string | null }) {
  const color = status === 'live' ? '#22c55e' : status === 'published' ? '#00BFA6' : status === 'ended' ? '#64748B' : '#94A3B8'
  return (
    <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color, background: color + '22', padding: '2px 6px', borderRadius: 4 }}>
      {status ?? 'draft'}
    </span>
  )
}

function RolePillLink({ pill }: { pill: RolePill }) {
  if (pill.type === 'attendee') {
    return (
      <Link href={`/e/${pill.eventSlug}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: '#22c55e22', color: '#22c55e', textDecoration: 'none', border: '1px solid #22c55e44' }}>
        👤 Attendee · <span style={{ textTransform: 'capitalize' }}>{pill.status}</span>
      </Link>
    )
  }
  if (pill.type === 'speaker') {
    return (
      <Link href={`/speaker/${pill.token}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: 'var(--pz-teal, #00BFA6)22', color: 'var(--pz-teal, #00BFA6)', textDecoration: 'none', border: '1px solid var(--pz-teal, #00BFA6)44' }}>
        🎙️ Speaker{pill.speakerRole ? ` · ${pill.speakerRole}` : ''}
      </Link>
    )
  }
  return (
    <Link href={`/volunteer/${pill.token}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: '#f59e0b22', color: '#f59e0b', textDecoration: 'none', border: '1px solid #f59e0b44' }}>
      🙋 Volunteer{pill.role ? ` · ${pill.role}` : ''}
    </Link>
  )
}

export default async function MyEventsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [regsResult, speakerResult, volunteerResult] = await Promise.all([
    supabase
      .from('registrations')
      .select('id, event_id, status, created_at, events(id, title, slug, start_at, end_at, status, org_id, organizations(name, slug))')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('speakers')
      .select('id, event_id, status, confirmation_token, event_role, events(id, title, slug, start_at, end_at, status)')
      .eq('email', user.email!)
      .in('status', ['confirmed', 'invited']),
    supabase
      .from('volunteers')
      .select('id, event_id, role, shift_response, portal_access_token, events(id, title, slug, start_at, end_at, status)')
      .eq('email', user.email!),
  ])

  const registrations = (regsResult.data ?? []) as any[]
  const speakerRoles = (speakerResult.data ?? []) as any[]
  const volunteerRoles = (volunteerResult.data ?? []) as any[]

  // Build unified event map
  const eventMap = new Map<string, EventEntry>()

  for (const reg of registrations) {
    const ev = reg.events
    if (!ev) continue
    const entry = eventMap.get(ev.id) ?? { id: ev.id, title: ev.title, slug: ev.slug, start_at: ev.start_at, end_at: ev.end_at, status: ev.status, roles: [] as RolePill[] }
    entry.roles.push({ type: 'attendee', status: reg.status, regId: reg.id, eventSlug: ev.slug })
    eventMap.set(ev.id, entry)
  }

  for (const sp of speakerRoles) {
    const ev = sp.events
    if (!ev) continue
    const entry = eventMap.get(ev.id) ?? { id: ev.id, title: ev.title, slug: ev.slug, start_at: ev.start_at, end_at: ev.end_at, status: ev.status, roles: [] as RolePill[] }
    entry.roles.push({ type: 'speaker', speakerRole: sp.event_role ?? null, token: sp.confirmation_token })
    eventMap.set(ev.id, entry)
  }

  for (const vol of volunteerRoles) {
    const ev = vol.events
    if (!ev) continue
    const entry = eventMap.get(ev.id) ?? { id: ev.id, title: ev.title, slug: ev.slug, start_at: ev.start_at, end_at: ev.end_at, status: ev.status, roles: [] as RolePill[] }
    entry.roles.push({ type: 'volunteer', role: vol.role ?? null, token: vol.portal_access_token })
    eventMap.set(ev.id, entry)
  }

  const now = new Date()
  const events = Array.from(eventMap.values()).sort((a, b) => {
    const aDate = a.start_at ? new Date(a.start_at).getTime() : 0
    const bDate = b.start_at ? new Date(b.start_at).getTime() : 0
    const aUpcoming = a.start_at ? new Date(a.start_at) >= now : false
    const bUpcoming = b.start_at ? new Date(b.start_at) >= now : false
    if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1
    return aUpcoming ? aDate - bDate : bDate - aDate
  })

  // Stats for attendance summary bar
  const confirmedRegs = registrations.filter((r: any) => ['confirmed', 'checked_in'].includes(r.status))
  const attendedCount = confirmedRegs.filter((r: any) => r.status === 'checked_in').length
  const upcomingCount = registrations.filter((r: any) =>
    r.status === 'confirmed' && new Date((r.events as any)?.start_at) > new Date()
  ).length

  // Org attendance history
  const orgHistory: Record<string, { orgName: string; orgSlug: string; count: number; lastAt: string }> = {}
  for (const reg of confirmedRegs as any[]) {
    const orgId = (reg.events as any)?.org_id
    const orgName = (reg.events as any)?.organizations?.name
    const orgSlug = (reg.events as any)?.organizations?.slug
    if (!orgId || !orgName) continue
    if (!orgHistory[orgId]) orgHistory[orgId] = { orgName, orgSlug: orgSlug ?? '', count: 0, lastAt: '' }
    orgHistory[orgId].count++
    const startAt = (reg.events as any)?.start_at ?? ''
    if (startAt > orgHistory[orgId].lastAt) orgHistory[orgId].lastAt = startAt
  }

  // Suggested events from orgs the user has attended
  const attendedOrgIds = [...new Set(
    registrations
      .map((r: any) => (r.events as any)?.org_id)
      .filter(Boolean) as string[]
  )]

  let suggestedEvents: any[] = []
  if (attendedOrgIds.length > 0) {
    const registeredEventIds = registrations.map((r: any) => r.event_id).filter(Boolean) as string[]
    let query = supabase
      .from('events')
      .select('id, title, slug, start_at, end_at, venue_city, venue_state, organizations(name, logo_url)')
      .in('org_id', attendedOrgIds)
      .in('status', ['published', 'live'])
      .eq('is_discoverable', true)
      .gt('start_at', now.toISOString())
      .order('start_at', { ascending: true })
      .limit(3)

    if (registeredEventIds.length > 0) {
      query = query.not('id', 'in', `(${registeredEventIds.join(',')})`)
    }

    const { data: suggested } = await query
    suggestedEvents = (suggested ?? []) as any[]
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--pz-text)', marginBottom: 24 }}>My Events</h1>

      {confirmedRegs.length > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          {[
            { label: 'Events registered', value: confirmedRegs.length },
            { label: 'Events attended', value: attendedCount },
            { label: 'Upcoming', value: upcomingCount },
          ].map(({ label, value }) => (
            <div key={label} style={{
              flex: 1, minWidth: 100, background: 'var(--pz-surface)',
              borderRadius: 10, padding: '0.875rem', border: '1px solid var(--pz-border)',
              textAlign: 'center'
            }}>
              <p style={{ fontSize: 24, fontWeight: 800, color: 'var(--pz-teal)', margin: 0 }}>{value}</p>
              <p style={{ fontSize: 12, color: 'var(--pz-muted)', margin: '2px 0 0' }}>{label}</p>
            </div>
          ))}
        </div>
      )}

      {events.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--pz-muted)', fontSize: 14 }}>
          You haven't registered for any events yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {events.map(ev => {
            const date = ev.start_at ? new Date(ev.start_at) : null
            return (
              <div key={ev.id} style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 10, padding: '1.25rem', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                {date && (
                  <div style={{ minWidth: 52, textAlign: 'center', background: 'var(--pz-bg)', border: '1px solid var(--pz-border)', borderRadius: 8, padding: '6px 4px', flexShrink: 0 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--pz-teal)', textTransform: 'uppercase', letterSpacing: 1 }}>
                      {date.toLocaleDateString('en-US', { month: 'short' })}
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--pz-text)', lineHeight: 1.1 }}>
                      {date.getDate()}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--pz-muted)' }}>
                      {date.getFullYear()}
                    </div>
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--pz-text)', margin: 0 }}>{ev.title}</p>
                    <StatusBadge status={ev.status} />
                  </div>
                  {date && (
                    <p style={{ fontSize: 12, color: 'var(--pz-muted)', marginBottom: 8 }}>
                      {date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {ev.roles.map((pill, i) => (
                      <RolePillLink key={i} pill={pill} />
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {Object.values(orgHistory).length > 0 && (
        <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--pz-border)' }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--pz-muted)',
                       textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
            Your history
          </h2>
          {Object.values(orgHistory)
            .sort((a, b) => b.count - a.count)
            .map(({ orgName, orgSlug, count, lastAt }) => (
              <div key={orgSlug} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0.75rem 0', borderBottom: '1px solid var(--pz-border)'
              }}>
                <div>
                  <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--pz-text)', margin: '0 0 2px' }}>
                    {orgName}
                  </p>
                  {lastAt && (
                    <p style={{ fontSize: 12, color: 'var(--pz-muted)', margin: 0 }}>
                      Last attended {new Date(lastAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </p>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--pz-teal)' }}>
                    {count} event{count !== 1 ? 's' : ''}
                  </span>
                  {orgSlug && (
                    <a href={`/o/${orgSlug}`}
                      style={{ fontSize: 12, color: 'var(--pz-muted)', textDecoration: 'none',
                               border: '1px solid var(--pz-border)', borderRadius: 6, padding: '3px 8px' }}>
                      View org →
                    </a>
                  )}
                </div>
              </div>
            ))
          }
        </div>
      )}

      {suggestedEvents.length > 0 && (
        <div style={{ marginTop: '2.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--pz-border)' }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--pz-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
            More from orgs you&apos;ve attended
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {suggestedEvents.map((e: any) => (
              <a key={e.id} href={`/e/${e.slug}`} style={{ display: 'block', padding: '0.875rem 1rem', background: 'var(--pz-surface)', borderRadius: 10, border: '1px solid var(--pz-border)', textDecoration: 'none' }}>
                <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--pz-text)', margin: '0 0 2px' }}>
                  {e.title}
                </p>
                <p style={{ fontSize: 12, color: 'var(--pz-muted)', margin: 0 }}>
                  {(e.organizations as any)?.name} ·{' '}
                  {new Date(e.start_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  {e.venue_city ? ` · ${e.venue_city}` : ''}
                </p>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
