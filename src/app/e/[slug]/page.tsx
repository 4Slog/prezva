import { notFound } from 'next/navigation'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { getPublicEvent, getPublicAgenda, getPublicSpeakers, getPublicSponsors, getPublicTicketTypes } from '@/lib/public/actions'
import { ShareButtons } from '@/components/events/ShareButtons'
import { Calendar, MapPin, Users, Clock } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import QRDisplay from './my-qr/qr-display'
import { GuestConversionBanner } from '@/components/events/GuestConversionBanner'
import { VirtualJoinButton } from '@/components/events/VirtualJoinButton'
import { RoleSwitcherBanner } from '@/components/events/RoleSwitcherBanner'

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ reg?: string }>
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const event = await getPublicEvent(slug)
  if (!event) return { title: 'Event not found' }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://prezva.app'
  const title = `${(event as any).title} | Prezva`
  const description = (event as any).description
    ?? `Register for ${(event as any).title}${(event as any).venue_city ? ` in ${(event as any).venue_city}` : ''}`
  const image = (event as any).cover_image_url ?? `${appUrl}/og-default.png`
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      url: `${appUrl}/e/${slug}`,
      images: [{ url: image, width: 1200, height: 630 }],
      siteName: 'Prezva',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  }
}

export default async function PublicEventPage({ params, searchParams }: Props) {
  const { slug } = await params
  const { reg: regParam } = await searchParams
  const event = await getPublicEvent(slug)
  if (!event) notFound()

  const [sessions, speakers, sponsors, ticketTypes] = await Promise.all([
    getPublicAgenda(event.id),
    getPublicSpeakers(event.id),
    getPublicSponsors(event.id),
    getPublicTicketTypes(event.id),
  ])

  // Fetch org's other upcoming events for post-event "more from this org" section
  let moreEvents: any[] = []
  const eventOrgId = (event as any).org_id
  if (eventOrgId && new Date((event as any).end_at) < new Date()) {
    const admin = createAdminClient()
    const { data: orgEvents } = await admin
      .from('events')
      .select('id, title, slug, start_at')
      .eq('org_id', eventOrgId)
      .eq('status', 'published')
      .neq('id', event.id)
      .gt('start_at', new Date().toISOString())
      .order('start_at', { ascending: true })
      .limit(3)
    moreEvents = orgEvents ?? []
  }

  // Fetch org name for display
  const orgName = (event as any).organizations?.name ?? null

  // Context detection
  const jar = await cookies()
  const cookieRegId = jar.get(`pz_reg_${slug}`)?.value
  const resolvedRegId = regParam ?? cookieRegId

  let reg: any = null
  let leaderboardRank: number | null = null
  let currentSessions: any[] = []
  let nextSession: any = null

  if (resolvedRegId) {
    const admin = createAdminClient()
    const { data } = await admin
      .from('registrations')
      .select('id, attendee_name, attendee_email, qr_code, status, user_id, amount_paid_cents')
      .eq('id', resolvedRegId)
      .eq('event_id', event.id)
      .in('status', ['confirmed', 'checked_in'])
      .maybeSingle()
    reg = data

    if (reg?.status === 'checked_in') {
      const now = new Date().toISOString()
      const admin2 = createAdminClient()
      const [{ data: curSessions }, { data: nxtSession }, { data: lbPoints }] = await Promise.all([
        admin2.from('event_sessions').select('id, title, starts_at, ends_at, location').eq('event_id', event.id).lte('starts_at', now).gte('ends_at', now).order('starts_at'),
        admin2.from('event_sessions').select('id, title, starts_at, location').eq('event_id', event.id).gt('starts_at', now).order('starts_at').limit(1).maybeSingle(),
        admin2.from('leaderboard_points').select('user_id, registration_id, points').eq('event_id', event.id),
      ])
      currentSessions = curSessions ?? []
      nextSession = nxtSession ?? null

      // Compute rank
      if (lbPoints && (reg.user_id || resolvedRegId)) {
        const totals: Record<string, number> = {}
        for (const row of lbPoints as any[]) {
          const key = row.user_id ?? row.registration_id
          if (key) totals[key] = (totals[key] ?? 0) + row.points
        }
        const myKey = reg.user_id ?? resolvedRegId
        const sorted = Object.values(totals).sort((a, b) => b - a)
        const myTotal = totals[myKey] ?? 0
        leaderboardRank = sorted.indexOf(myTotal) + 1
      }
    }
  }

  // Detect additional roles for the logged-in user
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let speakerRecord: any = null
  let volunteerRecord: any = null

  if (user?.email) {
    const adminRoles = createAdminClient()
    const [spRes, volRes] = await Promise.all([
      adminRoles.from('speakers')
        .select('id, event_role, confirmation_token, status')
        .eq('event_id', event.id)
        .eq('email', user.email.toLowerCase())
        .in('status', ['confirmed', 'invited'])
        .maybeSingle(),
      adminRoles.from('volunteers')
        .select('id, role, portal_access_token')
        .eq('event_id', event.id)
        .eq('email', user.email.toLowerCase())
        .maybeSingle(),
    ])
    speakerRecord = spRes.data
    volunteerRecord = volRes.data
  }

  const eventRoles: { type: 'attendee' | 'speaker' | 'volunteer'; label: string; href: string; icon: string }[] = []
  if (reg) {
    eventRoles.push({ type: 'attendee', label: 'Attendee view', href: `/e/${slug}`, icon: '👤' })
  }
  if (speakerRecord) {
    eventRoles.push({
      type: 'speaker',
      label: speakerRecord.event_role === 'mc' ? 'MC view' : 'Speaker view',
      href: `/speaker/${speakerRecord.confirmation_token}`,
      icon: speakerRecord.event_role === 'mc' ? '🎙️' : '🎤',
    })
  }
  if (volunteerRecord) {
    eventRoles.push({
      type: 'volunteer',
      label: 'Volunteer view',
      href: `/volunteer/${volunteerRecord.portal_access_token}`,
      icon: '🙋',
    })
  }

  const now = new Date()
  const isPostEvent = new Date(event.end_at) < now
  const state = reg?.status === 'checked_in' ? 'checked_in'
    : reg ? 'registered'
    : 'public'

  const tz = (event as any).timezone || 'UTC'
  const start = new Date(event.start_at)
  const end = new Date(event.end_at)
  const fmtDate = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: tz })
  const fmtTime = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz })
  const startDay = start.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: tz })
  const endDay   = end.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: tz })
  const isSameDay = start.toDateString() === end.toDateString()
  const dateLabel = isSameDay ? fmtDate(start) : `${startDay} – ${endDay}`
  const tzLabel = (() => {
    try {
      return new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' })
        .formatToParts(start).find(p => p.type === 'timeZoneName')?.value ?? tz
    } catch { return tz }
  })()
  const location = event.venue_name ? (event.venue_city ? event.venue_name + ', ' + event.venue_city : event.venue_name) : null
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://prezva.app'
  const eventUrl = `${appUrl}/e/${slug}`

  const hasInvite = (event as any).member_gating === true
  const hasPaid   = (ticketTypes as any[]).some((t) => t.type === 'paid' && t.price_cents > 0)
  const ctaLabel  = hasInvite ? 'Request Access' : hasPaid ? 'Get Tickets' : 'Reserve Your Spot'
  const isDraftPreview = (event as any)._isDraftPreview === true
  const firstName = reg?.attendee_name?.split(' ')[0] ?? ''

  return (
    <div style={{ minHeight:'100vh', background:'var(--pz-bg)', color:'var(--pz-text)' }}>
      {isDraftPreview && (
        <div style={{ background:'var(--pz-warning-bg)', color:'var(--pz-warning)', padding:'0.5rem 1.5rem', textAlign:'center', fontSize:13, fontWeight:600 }}>
          ⚠ Draft preview — this event is not yet published. Only org members can see this page.
        </div>
      )}
      {/* ── HERO ───────────────────────────────────────────────────────────── */}

      {/* State: post-event */}
      {isPostEvent && reg && (
        <div style={{ background:'var(--pz-surface)', borderBottom:'1px solid var(--pz-border)', padding:'3rem 1.5rem' }}>
          <div style={{ maxWidth:800, margin:'0 auto' }}>
            <p style={{ color:'var(--pz-teal-ink)', fontWeight:600, marginBottom:8, fontSize:12, textTransform:'uppercase', letterSpacing:2 }}>Event complete</p>
            <h1 style={{ fontSize:'clamp(1.5rem,3.5vw,2.25rem)', fontWeight:800, marginBottom:'1rem', color:'var(--pz-text)' }}>Thanks for attending {event.title}!</h1>
            <div style={{ display:'flex', flexWrap:'wrap', gap:12, marginTop:'1.5rem' }}>
              {(event as any).survey_url && <a href={(event as any).survey_url} target="_blank" rel="noopener noreferrer" style={{ background:'var(--pz-teal)', color:'var(--pz-on-accent)', padding:'0.65rem 1.5rem', borderRadius:8, fontWeight:700, textDecoration:'none', fontSize:14 }}>Complete your survey →</a>}
              {(event as any).certificate_enabled && <Link href={`/e/${slug}/certificate`} style={{ background:'var(--pz-surface-2)', color:'var(--pz-text)', padding:'0.65rem 1.5rem', borderRadius:8, fontWeight:600, textDecoration:'none', fontSize:14, border:'1px solid var(--pz-border)' }}>Download certificate</Link>}
              <Link href={`/e/${slug}/people`} style={{ background:'var(--pz-surface-2)', color:'var(--pz-text)', padding:'0.65rem 1.5rem', borderRadius:8, fontWeight:600, textDecoration:'none', fontSize:14, border:'1px solid var(--pz-border)' }}>Connect with attendees</Link>
            </div>
            {moreEvents.length > 0 && (
              <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--pz-border)' }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--pz-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                  More events from {orgName ?? 'this organizer'}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {moreEvents.map((ev: any) => (
                    <div key={ev.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--pz-surface-2)', borderRadius: 8, padding: '0.75rem 1rem' }}>
                      <div>
                        <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 2, color: 'var(--pz-text)' }}>{ev.title}</p>
                        <p style={{ fontSize: 12, color: 'var(--pz-muted)' }}>
                          {new Date(ev.start_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                      </div>
                      <Link href={`/e/${ev.slug}`} style={{ fontSize: 13, color: 'var(--pz-teal-ink)', textDecoration: 'none', fontWeight: 500, whiteSpace: 'nowrap', marginLeft: 12 }}>
                        View event →
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* State: checked_in */}
      {!isPostEvent && state === 'checked_in' && (
        <div style={{ background:'var(--pz-surface)', borderBottom:'1px solid var(--pz-border)', padding:'3rem 1.5rem' }}>
          <div style={{ maxWidth:800, margin:'0 auto' }}>
            <p style={{ color:'var(--pz-teal-ink)', fontWeight:600, marginBottom:8, fontSize:12, textTransform:'uppercase', letterSpacing:2 }}>You&apos;re checked in</p>
            <h1 style={{ fontSize:'clamp(1.5rem,3.5vw,2.25rem)', fontWeight:800, marginBottom:'1.5rem', color:'var(--pz-text)' }}>Welcome to {event.title}{firstName ? `, ${firstName}` : ''}!</h1>
            {currentSessions.length > 0 && (
              <div style={{ marginBottom:16 }}>
                <p style={{ fontSize:12, color:'var(--pz-muted)', marginBottom:4, textTransform:'uppercase', letterSpacing:1 }}>Happening now</p>
                {currentSessions.map((s: any) => (
                  <div key={s.id} style={{ background:'var(--pz-teal-bg)', border:'1px solid var(--pz-teal)', borderRadius:8, padding:'0.75rem 1rem', marginBottom:6 }}>
                    <p style={{ fontWeight:600, fontSize:15, color:'var(--pz-text)' }}>{s.title}</p>
                    {s.location && <p style={{ fontSize:12, color:'var(--pz-muted)', marginTop:2 }}>{s.location}</p>}
                  </div>
                ))}
              </div>
            )}
            {nextSession && (
              <div style={{ marginBottom:20 }}>
                <p style={{ fontSize:12, color:'var(--pz-muted)', marginBottom:4, textTransform:'uppercase', letterSpacing:1 }}>Next up</p>
                <p style={{ fontSize:14, color:'var(--pz-text)' }}>
                  <strong>{nextSession.title}</strong>
                  {' '}at {new Date(nextSession.starts_at).toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit', timeZone:tz })} {tzLabel}
                  {nextSession.location ? ` · ${nextSession.location}` : ''}
                </p>
              </div>
            )}
            {leaderboardRank && <p style={{ fontSize:13, color:'var(--pz-muted)', marginBottom:20 }}>Your leaderboard rank: <strong style={{ color:'var(--pz-teal-ink)' }}>#{leaderboardRank}</strong></p>}
            {/* TODO(featured-links): hardcoded defaults — replace with admin-curated featured links per event (pre/post). See prezva_deferred_backlog.md "Admin-customizable attendee home". */}
            <div style={{ marginTop: '1.5rem' }}>
              <p style={{ fontSize: 12, color: 'var(--pz-muted)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, marginBottom: 10 }}>Explore</p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {[{label:'My Agenda',href:`/e/${slug}/my-agenda`},{label:'My QR',href:`/e/${slug}/my-qr`},{label:'Community',href:`/e/${slug}/community`}].map(({label,href}) => (
                  <Link key={href} href={href} style={{ background:'var(--pz-surface-2)', color:'var(--pz-text)', padding:'0.6rem 1.25rem', borderRadius:8, fontWeight:600, textDecoration:'none', fontSize:13, border:'1px solid var(--pz-border)' }}>{label}</Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* State: registered (not yet checked in, event not over) */}
      {!isPostEvent && state === 'registered' && (
        <div style={{ background:'var(--pz-surface)', borderBottom:'1px solid var(--pz-border)', padding:'3rem 1.5rem' }}>
          <div style={{ maxWidth:800, margin:'0 auto', display:'flex', gap:'2.5rem', flexWrap:'wrap', alignItems:'flex-start' }}>
            <div style={{ flex:1, minWidth:260 }}>
              <p style={{ color:'var(--pz-teal-ink)', fontWeight:600, marginBottom:8, fontSize:12, textTransform:'uppercase', letterSpacing:2 }}>You&apos;re registered</p>
              <h1 style={{ fontSize:'clamp(1.5rem,3.5vw,2.25rem)', fontWeight:800, marginBottom:'1rem', color:'var(--pz-text)' }}>{event.title}</h1>
              <div style={{ fontSize:14, display:'flex', flexDirection:'column', gap:6, color:'var(--pz-muted)' }}>
                <span><Calendar size={14} style={{ display:'inline', marginRight:6, verticalAlign:'middle', color:'var(--pz-teal)' }}/>{dateLabel}</span>
                <span><Clock size={14} style={{ display:'inline', marginRight:6, verticalAlign:'middle', color:'var(--pz-teal)' }}/>{fmtTime(start)} {tzLabel}</span>
                {location && <span><MapPin size={14} style={{ display:'inline', marginRight:6, verticalAlign:'middle', color:'var(--pz-teal)' }}/>{location}</span>}
              </div>
              <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginTop:'1.5rem' }}>
                <a href={`/api/registrations/${reg.id}/calendar.ics`} style={{ background:'var(--pz-surface-2)', color:'var(--pz-text)', padding:'0.6rem 1.25rem', borderRadius:7, fontWeight:600, textDecoration:'none', fontSize:13, border:'1px solid var(--pz-border)' }}>Add to Calendar</a>
                <Link href={`/e/${slug}/agenda`} style={{ background:'var(--pz-surface-2)', color:'var(--pz-text)', padding:'0.6rem 1.25rem', borderRadius:7, fontWeight:600, textDecoration:'none', fontSize:13, border:'1px solid var(--pz-border)' }}>View Schedule</Link>
                {['virtual','hybrid'].includes((event as any).event_type) && (event as any).virtual_url && (
                  <VirtualJoinButton
                    virtualUrl={(event as any).virtual_url}
                    registrationId={reg.id}
                  />
                )}
              </div>
              {eventRoles.length > 1 && reg && (
                <div style={{ marginTop: '1.5rem' }}>
                  <RoleSwitcherBanner roles={eventRoles} />
                </div>
              )}
            </div>
            {reg?.qr_code && (
              <div style={{ textAlign:'center' }}>
                <p style={{ fontSize:11, color:'var(--pz-muted)', marginBottom:8, textTransform:'uppercase', letterSpacing:1 }}>Your check-in QR</p>
                <QRDisplay qrCode={reg.qr_code} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* State: public (no registration) */}
      {state === 'public' && (
        <div style={{ background:'var(--pz-surface)', borderBottom:'1px solid var(--pz-border)', padding:'3rem 1.5rem' }}>
          <div style={{ maxWidth:800, margin:'0 auto' }}>
            <p style={{ color:'var(--pz-teal-ink)', fontWeight:600, marginBottom:'0.5rem', textTransform:'uppercase', letterSpacing:2, fontSize:12 }}>
              {event.event_type.replace('_',' ')}
            </p>
            <h1 style={{ fontSize:'clamp(1.75rem,4vw,2.75rem)', fontWeight:800, marginBottom:'1rem', color:'var(--pz-text)' }}>{event.title}</h1>
            {event.description && <p style={{ color:'var(--pz-muted)', lineHeight:1.7, maxWidth:600 }}>{event.description}</p>}
            <div style={{ display:'flex', flexWrap:'wrap', gap:'1.5rem', marginTop:'1.5rem', fontSize:14, color:'var(--pz-text)' }}>
              <span style={{ display:'flex', alignItems:'center', gap:6 }}><Calendar size={16} style={{ color:'var(--pz-teal)' }}/>{dateLabel}</span>
              <span style={{ display:'flex', alignItems:'center', gap:6 }}><Clock size={16} style={{ color:'var(--pz-teal)' }}/>{fmtTime(start)} – {fmtTime(end)} {tzLabel}</span>
              {location && <span style={{ display:'flex', alignItems:'center', gap:6 }}><MapPin size={16} style={{ color:'var(--pz-teal)' }}/>{location}</span>}
              {['virtual','hybrid'].includes((event as any).event_type) && (event as any).virtual_url && (
                reg?.id ? (
                  <VirtualJoinButton
                    virtualUrl={(event as any).virtual_url}
                    registrationId={reg.id}
                  />
                ) : (
                  <a href={(event as any).virtual_url} target="_blank" rel="noopener noreferrer" style={{ display:'flex', alignItems:'center', gap:6, color:'var(--pz-teal-ink)', textDecoration:'none' }}>
                    💻 Join online
                  </a>
                )
              )}
              {event.capacity && <span style={{ display:'flex', alignItems:'center', gap:6 }}><Users size={16} style={{ color:'var(--pz-teal)' }}/>{event.registration_count} / {event.capacity} registered</span>}
            </div>
            <div style={{ marginTop:'2rem', display:'flex', gap:'1rem', flexWrap:'wrap' }}>
              {!isPostEvent && <Link href={'/e/'+slug+'/register'} style={{ background:'var(--pz-teal)', color:'var(--pz-on-accent)', padding:'0.75rem 2rem', borderRadius:8, fontWeight:700, textDecoration:'none', fontSize:15 }}>{ctaLabel}</Link>}
              <Link href={'/e/'+slug+'/agenda'} style={{ background:'var(--pz-surface-2)', color:'var(--pz-text)', padding:'0.75rem 2rem', borderRadius:8, fontWeight:600, textDecoration:'none', fontSize:15, border:'1px solid var(--pz-border)' }}>View Agenda</Link>
              <a href={`/api/events/${slug}/calendar.ics`} style={{ background:'var(--pz-surface-2)', color:'var(--pz-text)', padding:'0.75rem 2rem', borderRadius:8, fontWeight:600, textDecoration:'none', fontSize:15, border:'1px solid var(--pz-border)' }}>Add to Calendar</a>
            </div>
            <ShareButtons url={eventUrl} title={event.title} />
          </div>
        </div>
      )}

      {/* ── BODY (same for all states) ─────────────────────────────────────── */}
      <div style={{ maxWidth:800, margin:'0 auto', padding:'0 1.5rem' }}>
        {reg && !reg.user_id && (
          <div style={{ paddingTop: '1.5rem' }}>
            <GuestConversionBanner
              regId={reg.id}
              email={reg.attendee_email ?? ''}
              slug={slug}
            />
          </div>
        )}
        {state === 'public' && (
          <div style={{ marginBottom: '2rem' }}>
            {/* TODO(featured-links): hardcoded defaults — replace with admin-curated featured links per event (pre/post). See prezva_deferred_backlog.md "Admin-customizable attendee home". */}
            <p style={{ fontSize: 12, color: 'var(--pz-muted)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, marginBottom: 10 }}>Explore</p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {[{label:'Agenda',href:'/e/'+slug+'/agenda'},{label:'Speakers',href:'/e/'+slug+'/speakers'},{label:'Community',href:'/e/'+slug+'/community'}].map(({label,href}) => (
                <Link key={href} href={href} style={{ background:'var(--pz-surface-2)', color:'var(--pz-text)', padding:'0.6rem 1.25rem', borderRadius:8, fontWeight:600, textDecoration:'none', fontSize:13, border:'1px solid var(--pz-border)' }}>{label}</Link>
              ))}
            </div>
          </div>
        )}
        {sessions.length > 0 && (
          <section style={{ marginBottom:'3rem' }}>
            <h2 style={{ fontSize:'1.25rem', fontWeight:700, marginBottom:'1.25rem' }}>Featured Sessions</h2>
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {sessions.slice(0,4).map((s: any) => (
                <div key={s.id} style={{ border:'1px solid var(--pz-border)', borderRadius:10, padding:'1rem 1.25rem', background:'var(--pz-surface)', borderLeft:'4px solid '+(s.tracks?.color ?? 'var(--pz-teal)') }}>
                  <p style={{ fontWeight:600, marginBottom:4 }}>{s.title}</p>
                  <p style={{ fontSize:13, color:'var(--pz-muted)' }}>
                    {new Date(s.starts_at).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:tz})} {tzLabel}
                    {s.tracks?.name ? ' · '+s.tracks.name : ''}
                  </p>
                </div>
              ))}
            </div>
            {sessions.length > 4 && <Link href={'/e/'+slug+'/agenda'} style={{ color:'var(--pz-teal-ink)', textDecoration:'none', fontSize:14, marginTop:12, display:'inline-block' }}>View all {sessions.length} sessions</Link>}
          </section>
        )}
        {speakers.length > 0 && (
          <section style={{ marginBottom:'3rem' }}>
            <h2 style={{ fontSize:'1.25rem', fontWeight:700, marginBottom:'1.25rem' }}>Speakers</h2>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:16 }}>
              {speakers.map((sp: any) => (
                <Link key={sp.id} href={'/e/'+slug+'/speakers/'+sp.id} style={{ textDecoration:'none', color:'inherit' }}>
                  <div style={{ border:'1px solid var(--pz-border)', borderRadius:12, padding:'1.25rem', textAlign:'center', background:'var(--pz-surface)' }}>
                    <div style={{ width:60, height:60, borderRadius:'50%', background:'var(--pz-surface-2)', margin:'0 auto 0.75rem', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, color:'var(--pz-teal-ink)', fontWeight:700, overflow:'hidden' }}>
                      {sp.photo_url ? <img src={sp.photo_url} alt={sp.name} style={{ width:'100%', height:'100%', objectFit:'cover' }}/> : sp.name.charAt(0)}
                    </div>
                    <p style={{ fontWeight:600, fontSize:14 }}>{sp.name}</p>
                    {sp.job_title && <p style={{ fontSize:12, color:'var(--pz-muted)', marginTop:2 }}>{sp.job_title}</p>}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
        {sponsors.length > 0 && (
          <section id="sponsors" style={{ marginBottom:'3rem' }}>
            <h2 style={{ fontSize:'1.25rem', fontWeight:700, marginBottom:'1.5rem' }}>Sponsors</h2>
            {(['title','gold','silver','bronze'] as const).map(tier => {
              const group = sponsors.filter((s: any) => s.tier === tier)
              if (group.length === 0) return null
              const tierLabel: Record<string, string> = { title:'Title Sponsor', gold:'Gold', silver:'Silver', bronze:'Bronze' }
              const tierSize: Record<string, number> = { title:120, gold:90, silver:70, bronze:54 }
              return (
                <div key={tier} style={{ marginBottom:'1.5rem' }}>
                  <p style={{ fontSize:11, fontWeight:700, color:'var(--pz-muted)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:12 }}>{tierLabel[tier]}</p>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:16, alignItems:'center' }}>
                    {group.map((sp: any) => (
                      <a key={sp.id} href={sp.website_url ?? undefined} target="_blank" rel="noreferrer"
                        style={{ display:'flex', alignItems:'center', justifyContent:'center', width:tierSize[tier]*1.8, height:tierSize[tier], border:'1px solid var(--pz-border)', borderRadius:10, background:'var(--pz-surface)', padding:'0.5rem 1rem', textDecoration:'none', overflow:'hidden' }}>
                        {sp.logo_url ? <img src={sp.logo_url} alt={sp.name} style={{ maxWidth:'100%', maxHeight:'100%', objectFit:'contain' }}/> : <span style={{ fontSize:13, fontWeight:700, color:'var(--pz-text)', textAlign:'center' }}>{sp.name}</span>}
                      </a>
                    ))}
                  </div>
                </div>
              )
            })}
          </section>
        )}
      </div>
    </div>
  )
}
