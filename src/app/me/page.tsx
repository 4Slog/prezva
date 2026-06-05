import { requireUser } from '@/lib/auth/get-user'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { ORG_ROLE_BADGE_CONFIGS } from '@/lib/ui/category-colors'

type EventRef = {
  id: string
  title: string | null
  slug: string | null
  start_at: string | null
  end_at: string | null
  venue_city: string | null
  venue_state: string | null
  status: string | null
}

type AttendeeRow = {
  id: string
  status: string
  qr_code: string | null
  ticket_type_id: string | null
  event_id: string
  ticket_types: { name: string | null } | null
  events: EventRef | null
}

type SpeakerRow = {
  id: string
  status: string | null
  confirmation_token: string | null
  event_role: string | null
  event_id: string
  events: EventRef | null
}

type VolunteerRow = {
  id: string
  status: string | null
  portal_access_token: string | null
  role: string | null
  shift_start: string | null
  shift_end: string | null
  event_id: string
  events: EventRef | null
}

type OrgMembershipRow = {
  role: string
  organizations: { id: string; name: string; slug: string; logo_url: string | null } | null
}

type Role =
  | { kind: 'attendee'; ticketName: string | null; eventSlug: string; eventId: string; regId: string }
  | { kind: 'speaker'; sessionName: string | null; token: string | null; speakerId: string }
  | { kind: 'volunteer'; role: string | null; shiftStart: string | null; shiftEnd: string | null; token: string | null; volunteerId: string }

type TimelineEntry = {
  event: EventRef
  roles: Role[]
}

const ROLE_PRIORITY: Record<Role['kind'], number> = { speaker: 0, volunteer: 1, attendee: 2 }

export default async function MePage() {
  const user = await requireUser()
  const admin = createAdminClient()
  const userEmail = user.email?.toLowerCase() ?? null

  const [orgMembershipsResult, registrationsResult, speakersByUserResult, speakersByEmailResult, volunteersByUserResult, volunteersByEmailResult] = await Promise.all([
    admin
      .from('org_members')
      .select('role, organizations(id, name, slug, logo_url)')
      .eq('user_id', user.id)
      .order('joined_at', { ascending: true }),
    admin
      .from('registrations')
      .select('id, status, qr_code, ticket_type_id, event_id, ticket_types(name), events(id, title, slug, start_at, end_at, venue_city, venue_state, status)')
      .eq('user_id', user.id)
      .in('status', ['confirmed', 'checked_in']),
    admin
      .from('speakers')
      .select('id, status, confirmation_token, event_role, event_id, events(id, title, slug, start_at, end_at, venue_city, venue_state, status)')
      .eq('user_id', user.id),
    userEmail
      ? admin
          .from('speakers')
          .select('id, status, confirmation_token, event_role, event_id, events(id, title, slug, start_at, end_at, venue_city, venue_state, status)')
          .eq('email', userEmail)
      : Promise.resolve({ data: [] as SpeakerRow[] }),
    admin
      .from('volunteers')
      .select('id, status, portal_access_token, role, shift_start, shift_end, event_id, events(id, title, slug, start_at, end_at, venue_city, venue_state, status)')
      .eq('user_id', user.id),
    userEmail
      ? admin
          .from('volunteers')
          .select('id, status, portal_access_token, role, shift_start, shift_end, event_id, events(id, title, slug, start_at, end_at, venue_city, venue_state, status)')
          .eq('email', userEmail)
      : Promise.resolve({ data: [] as VolunteerRow[] }),
  ])

  const orgs = (orgMembershipsResult.data ?? []) as unknown as OrgMembershipRow[]
  const registrations = (registrationsResult.data ?? []) as unknown as AttendeeRow[]

  // Merge speaker rows by id (user_id and email matches may overlap)
  const speakerMap = new Map<string, SpeakerRow>()
  for (const row of ((speakersByUserResult.data ?? []) as unknown as SpeakerRow[])) speakerMap.set(row.id, row)
  for (const row of ((speakersByEmailResult.data ?? []) as unknown as SpeakerRow[])) if (!speakerMap.has(row.id)) speakerMap.set(row.id, row)
  const speakers = Array.from(speakerMap.values())

  const volunteerMap = new Map<string, VolunteerRow>()
  for (const row of ((volunteersByUserResult.data ?? []) as unknown as VolunteerRow[])) volunteerMap.set(row.id, row)
  for (const row of ((volunteersByEmailResult.data ?? []) as unknown as VolunteerRow[])) if (!volunteerMap.has(row.id)) volunteerMap.set(row.id, row)
  const volunteers = Array.from(volunteerMap.values())

  // Build a single timeline keyed by event_id, only upcoming events
  const nowIso = new Date().toISOString()
  const timelineMap = new Map<string, TimelineEntry>()

  function pushRole(event: EventRef | null, role: Role) {
    if (!event?.id) return
    if (event.start_at && event.start_at < nowIso) return
    const existing = timelineMap.get(event.id) ?? { event, roles: [] as Role[] }
    existing.roles.push(role)
    timelineMap.set(event.id, existing)
  }

  for (const r of registrations) {
    if (!r.events) continue
    pushRole(r.events, {
      kind: 'attendee',
      ticketName: r.ticket_types?.name ?? null,
      eventSlug: r.events.slug ?? '',
      eventId: r.event_id,
      regId: r.id,
    })
  }
  for (const sp of speakers) {
    if (!sp.events) continue
    pushRole(sp.events, {
      kind: 'speaker',
      sessionName: sp.event_role ?? null,
      token: sp.confirmation_token,
      speakerId: sp.id,
    })
  }
  for (const v of volunteers) {
    if (!v.events) continue
    pushRole(v.events, {
      kind: 'volunteer',
      role: v.role,
      shiftStart: v.shift_start,
      shiftEnd: v.shift_end,
      token: v.portal_access_token,
      volunteerId: v.id,
    })
  }

  const timeline = Array.from(timelineMap.values())
    .sort((a, b) => {
      const aStart = a.event.start_at ?? ''
      const bStart = b.event.start_at ?? ''
      return aStart.localeCompare(bStart)
    })

  // Greeting
  const fullName =
    (user.user_metadata as { full_name?: string; name?: string } | null)?.full_name ??
    (user.user_metadata as { name?: string } | null)?.name ??
    user.email ??
    ''
  const firstName = fullName.split(' ')[0] || (user.email?.split('@')[0] ?? 'there')

  const hasAnything = timeline.length > 0 || orgs.length > 0

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '1.5rem 1.25rem 3rem' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--pz-text)', margin: '0 0 4px' }}>
        Hi {firstName} 👋
      </h1>
      <p style={{ color: 'var(--pz-muted)', fontSize: 14, margin: '0 0 28px' }}>
        Your personal hub
      </p>

      {/* UPCOMING timeline */}
      {timeline.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 12, fontWeight: 700, color: 'var(--pz-muted)', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 12px' }}>
            Upcoming
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {timeline.map(({ event, roles }) => (
              <TimelineCard key={event.id} event={event} roles={roles} />
            ))}
          </div>
        </section>
      )}

      {/* MY ORGANIZATIONS */}
      {orgs.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 12, fontWeight: 700, color: 'var(--pz-muted)', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 12px' }}>
            My organizations
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {orgs.map((m) => {
              if (!m.organizations) return null
              const org = m.organizations
              return (
                <div
                  key={org.id}
                  style={{
                    background: 'var(--pz-surface)',
                    border: '1px solid var(--pz-border)',
                    borderRadius: 12,
                    padding: '1rem 1.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                  }}
                >
                  <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--pz-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                    {org.logo_url ? (
                      <img src={org.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--pz-teal)' }}>
                        {org.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--pz-text)', margin: '0 0 4px' }}>
                      {org.name}
                    </p>
                    <RoleBadge kind={`org_${m.role}` as OrgRoleKind} />
                  </div>
                  <Link
                    href="/dashboard"
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--pz-teal)',
                      textDecoration: 'none',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Dashboard →
                  </Link>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* EMPTY STATE */}
      {!hasAnything && (
        <section
          style={{
            background: 'var(--pz-surface)',
            border: '1px solid var(--pz-border)',
            borderRadius: 12,
            padding: '2rem 1.5rem',
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: 15, color: 'var(--pz-text)', margin: '0 0 8px', fontWeight: 600 }}>
            Welcome to Prezva.
          </p>
          <p style={{ fontSize: 14, color: 'var(--pz-muted)', margin: '0 0 20px' }}>
            Find events to attend or create your own organization to start hosting.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Link
              href="/discover"
              style={{
                padding: '0.75rem 1.25rem',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 700,
                background: 'var(--pz-teal)',
                color: 'var(--pz-on-accent)',
                textDecoration: 'none',
              }}
            >
              Browse events
            </Link>
            <Link
              href="/onboarding"
              style={{
                padding: '0.75rem 1.25rem',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 700,
                background: 'transparent',
                color: 'var(--pz-text)',
                border: '1px solid var(--pz-border)',
                textDecoration: 'none',
              }}
            >
              Create an organization
            </Link>
          </div>
        </section>
      )}

      {/* Show "Create an organization" hint for users with relationships but no org */}
      {hasAnything && orgs.length === 0 && (
        <section style={{ marginTop: 8 }}>
          <Link
            href="/onboarding"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '0.625rem 1rem',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 600,
              background: 'transparent',
              color: 'var(--pz-muted)',
              border: '1px solid var(--pz-border)',
              textDecoration: 'none',
            }}
          >
            + Create an organization
          </Link>
        </section>
      )}
    </div>
  )
}

// ── Timeline card ──────────────────────────────────────────────────────────────

function TimelineCard({ event, roles }: { event: EventRef; roles: Role[] }) {
  const date = event.start_at ? new Date(event.start_at) : null
  const city = [event.venue_city, event.venue_state].filter(Boolean).join(', ')

  const sortedRoles = [...roles].sort((a, b) => ROLE_PRIORITY[a.kind] - ROLE_PRIORITY[b.kind])
  const primary = sortedRoles[0]

  return (
    <div
      style={{
        background: 'var(--pz-surface)',
        border: '1px solid var(--pz-border)',
        borderRadius: 12,
        padding: '1rem 1.25rem',
        display: 'flex',
        gap: 14,
        alignItems: 'flex-start',
      }}
    >
      {date && (
        <div
          style={{
            minWidth: 52,
            textAlign: 'center',
            background: 'var(--pz-surface-2)',
            border: '1px solid var(--pz-border)',
            borderRadius: 8,
            padding: '6px 4px',
            flexShrink: 0,
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--pz-teal)', textTransform: 'uppercase', letterSpacing: 1 }}>
            {date.toLocaleDateString('en-US', { month: 'short' })}
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--pz-text)', lineHeight: 1.1 }}>
            {date.getDate()}
          </div>
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--pz-text)', margin: '0 0 4px' }}>
          {event.title ?? 'Event'}
        </p>
        <p style={{ fontSize: 12, color: 'var(--pz-muted)', margin: '0 0 10px' }}>
          {date ? date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'Date TBA'}
          {city ? ` · ${city}` : ''}
        </p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {sortedRoles.map((r, i) => (
            <RolePill key={i} role={r} eventSlug={event.slug ?? ''} />
          ))}
        </div>
        <PrimaryActionLink role={primary} eventSlug={event.slug ?? ''} />
      </div>
    </div>
  )
}

function PrimaryActionLink({ role, eventSlug }: { role: Role; eventSlug: string }) {
  const { href, label } = primaryActionFor(role, eventSlug)
  return (
    <Link
      href={href}
      style={{
        display: 'inline-block',
        padding: '0.5rem 0.875rem',
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 600,
        background: 'var(--pz-teal)',
        color: 'var(--pz-on-accent)',
        textDecoration: 'none',
      }}
    >
      {label}
    </Link>
  )
}

function primaryActionFor(role: Role, eventSlug: string): { href: string; label: string } {
  if (role.kind === 'speaker') {
    return role.token
      ? { href: `/speaker/${role.token}`, label: 'Open speaker portal' }
      : { href: `/e/${eventSlug}`, label: 'View event' }
  }
  if (role.kind === 'volunteer') {
    return role.token
      ? { href: `/volunteer/${role.token}`, label: 'Open volunteer portal' }
      : { href: `/e/${eventSlug}`, label: 'View event' }
  }
  return { href: `/e/${eventSlug}`, label: 'View ticket' }
}

// ── Role pills ─────────────────────────────────────────────────────────────────

const ROLE_PILL: Record<Role['kind'], React.CSSProperties> = {
  attendee: { background: 'var(--pz-teal-bg)', color: 'var(--pz-teal-ink)', border: '1px solid var(--pz-teal)' },
  speaker:  { background: 'var(--pz-warning-bg)', color: 'var(--pz-warning)', border: '1px solid var(--pz-warning-fill)' },
  volunteer: { background: 'var(--pz-success-bg)', color: 'var(--pz-success)', border: '1px solid var(--pz-success-fill)' },
}

const PILL_BASE: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, textDecoration: 'none',
}

function RolePill({ role, eventSlug }: { role: Role; eventSlug: string }) {
  const pillStyle = { ...PILL_BASE, ...ROLE_PILL[role.kind] }
  if (role.kind === 'attendee') {
    return (
      <Link href={`/e/${eventSlug}`} style={pillStyle}>
        🎟️ Attendee{role.ticketName ? ` · ${role.ticketName}` : ''}
      </Link>
    )
  }
  if (role.kind === 'speaker') {
    const href = role.token ? `/speaker/${role.token}` : `/e/${eventSlug}`
    return (
      <Link href={href} style={pillStyle}>
        🎤 Speaker{role.sessionName ? ` · ${role.sessionName}` : ''}
      </Link>
    )
  }
  const href = role.token ? `/volunteer/${role.token}` : `/e/${eventSlug}`
  const shift = role.shiftStart
    ? new Date(role.shiftStart).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : null
  return (
    <Link href={href} style={pillStyle}>
      🙋 Volunteer{role.role ? ` · ${role.role}` : ''}{shift ? ` · ${shift}` : ''}
    </Link>
  )
}

// ── Org role badges ────────────────────────────────────────────────────────────

type OrgRoleKind = 'org_owner' | 'org_admin' | 'org_staff'

function RoleBadge({ kind }: { kind: OrgRoleKind }) {
  // eslint-disable-next-line no-restricted-syntax
  const cfg = ORG_ROLE_BADGE_CONFIGS[kind] ?? { label: 'Member', color: '#94A3B8' }
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: 10,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        color: cfg.color,
        background: cfg.color + '22',
        padding: '2px 8px',
        borderRadius: 4,
      }}
    >
      {cfg.label}
    </span>
  )
}
