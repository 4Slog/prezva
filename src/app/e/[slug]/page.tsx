import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPublicEvent, getPublicAgenda, getPublicSpeakers, getPublicSponsors, getPublicTicketTypes } from '@/lib/public/actions'
import { ShareButtons } from '@/components/events/ShareButtons'
import { Calendar, MapPin, Users, Clock } from 'lucide-react'

export default async function PublicEventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const event = await getPublicEvent(slug)
  if (!event) notFound()
  const [sessions, speakers, sponsors, ticketTypes] = await Promise.all([
    getPublicAgenda(event.id),
    getPublicSpeakers(event.id),
    getPublicSponsors(event.id),
    getPublicTicketTypes(event.id),
  ])
  const tz = (event as any).timezone || 'UTC'
  const start = new Date(event.start_at)
  const end = new Date(event.end_at)
  const fmtDate = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: tz })
  const fmtTime = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz })
  // Format date range: "Monday, June 15 – Wednesday, June 17, 2026"
  const startDay = start.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: tz })
  const endDay   = end.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: tz })
  const isSameDay = start.toDateString() === end.toDateString()
  const dateLabel = isSameDay ? fmtDate(start) : `${startDay} – ${endDay}`
  // Friendly timezone abbreviation
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

  return (
    <div style={{ minHeight:'100vh', background:'var(--color-bg)', color:'var(--color-text)' }}>
      {isDraftPreview && (
        <div style={{ background:'#92400e', color:'#fef3c7', padding:'0.5rem 1.5rem', textAlign:'center', fontSize:13, fontWeight:600 }}>
          ⚠ Draft preview — this event is not yet published. Only org members can see this page.
        </div>
      )}
      {/* Minimal nav header */}
      <header style={{ background:'var(--color-navy)', borderBottom:'1px solid rgba(255,255,255,0.08)', padding:'0.75rem 1.5rem', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <Link href="/" style={{ fontWeight:800, fontSize:18, color:'var(--color-teal)', textDecoration:'none', letterSpacing:-0.5 }}>P Prezva</Link>
        <Link href="/login" style={{ fontSize:13, color:'rgba(255,255,255,0.7)', textDecoration:'none' }}>Sign in</Link>
      </header>
      <div style={{ background:'var(--color-navy)', color:'#fff', padding:'3rem 1.5rem' }}>
        <div style={{ maxWidth:800, margin:'0 auto' }}>
          <p style={{ color:'var(--color-teal)', fontWeight:600, marginBottom:'0.5rem', textTransform:'uppercase', letterSpacing:2, fontSize:12 }}>
            {event.event_type.replace('_',' ')}
          </p>
          <h1 style={{ fontSize:'clamp(1.75rem,4vw,2.75rem)', fontWeight:800, marginBottom:'1rem' }}>{event.title}</h1>
          {event.description && <p style={{ opacity:0.85, lineHeight:1.7, maxWidth:600 }}>{event.description}</p>}
          <div style={{ display:'flex', flexWrap:'wrap', gap:'1.5rem', marginTop:'1.5rem', fontSize:14 }}>
            <span style={{ display:'flex', alignItems:'center', gap:6 }}><Calendar size={16} style={{ color:'var(--color-teal)' }}/>{dateLabel}</span>
            <span style={{ display:'flex', alignItems:'center', gap:6 }}><Clock size={16} style={{ color:'var(--color-teal)' }}/>{fmtTime(start)} – {fmtTime(end)} {tzLabel}</span>
            {location && <span style={{ display:'flex', alignItems:'center', gap:6 }}><MapPin size={16} style={{ color:'var(--color-teal)' }}/>{location}</span>}
            {event.capacity && <span style={{ display:'flex', alignItems:'center', gap:6 }}><Users size={16} style={{ color:'var(--color-teal)' }}/>{event.registration_count} / {event.capacity} registered</span>}
          </div>
          <div style={{ marginTop:'2rem', display:'flex', gap:'1rem', flexWrap:'wrap' }}>
            <Link href={'/e/'+slug+'/register'} style={{ background:'var(--color-teal)', color:'#fff', padding:'0.75rem 2rem', borderRadius:8, fontWeight:700, textDecoration:'none', fontSize:15 }}>{ctaLabel}</Link>
            <Link href={'/e/'+slug+'/agenda'} style={{ background:'rgba(255,255,255,0.1)', color:'#fff', padding:'0.75rem 2rem', borderRadius:8, fontWeight:600, textDecoration:'none', fontSize:15, border:'1px solid rgba(255,255,255,0.2)' }}>View Agenda</Link>
          </div>
          <ShareButtons url={eventUrl} title={event.title} calendarHref={`/api/events/${slug}/calendar.ics`} />
        </div>
      </div>
      <div style={{ maxWidth:800, margin:'0 auto', padding:'0 1.5rem' }}>
        <div style={{ borderBottom:'1px solid var(--color-border)', marginBottom:'2rem', display:'flex', gap:'2rem' }}>
          {[{label:'Agenda',href:'/e/'+slug+'/agenda'},{label:'Speakers',href:'/e/'+slug+'/speakers'},{label:'Trivia',href:'/e/'+slug+'/trivia'},{label:'Icebreakers',href:'/e/'+slug+'/icebreakers'},{label:'Leaderboard',href:'/e/'+slug+'/leaderboard'}].map(({label,href}) => (
            <Link key={href} href={href} style={{ padding:'1rem 0', color:'var(--color-text)', textDecoration:'none', fontSize:14, fontWeight:500 }}>{label}</Link>
          ))}
        </div>
        {sessions.length > 0 && (
          <section style={{ marginBottom:'3rem' }}>
            <h2 style={{ fontSize:'1.25rem', fontWeight:700, marginBottom:'1.25rem' }}>Featured Sessions</h2>
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {sessions.slice(0,4).map((s: any) => (
                <div key={s.id} style={{ border:'1px solid var(--color-border)', borderRadius:10, padding:'1rem 1.25rem', background:'var(--color-surface)', borderLeft:'4px solid '+(s.tracks?.color ?? 'var(--color-teal)') }}>
                  <p style={{ fontWeight:600, marginBottom:4 }}>{s.title}</p>
                  <p style={{ fontSize:13, color:'var(--color-text-muted)' }}>
                    {new Date(s.starts_at).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:tz})}
                    {s.tracks?.name ? ' · '+s.tracks.name : ''}
                  </p>
                </div>
              ))}
            </div>
            {sessions.length > 4 && <Link href={'/e/'+slug+'/agenda'} style={{ color:'var(--color-teal)', textDecoration:'none', fontSize:14, marginTop:12, display:'inline-block' }}>View all {sessions.length} sessions</Link>}
          </section>
        )}
        {speakers.length > 0 && (
          <section style={{ marginBottom:'3rem' }}>
            <h2 style={{ fontSize:'1.25rem', fontWeight:700, marginBottom:'1.25rem' }}>Speakers</h2>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:16 }}>
              {speakers.map((sp: any) => (
                <Link key={sp.id} href={'/e/'+slug+'/speakers/'+sp.id} style={{ textDecoration:'none', color:'inherit' }}>
                  <div style={{ border:'1px solid var(--color-border)', borderRadius:12, padding:'1.25rem', textAlign:'center', background:'var(--color-surface)' }}>
                    <div style={{ width:60, height:60, borderRadius:'50%', background:'var(--color-navy)', margin:'0 auto 0.75rem', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, color:'var(--color-teal)', fontWeight:700, overflow:'hidden' }}>
                      {sp.photo_url ? <img src={sp.photo_url} alt={sp.name} style={{ width:'100%', height:'100%', objectFit:'cover' }}/> : sp.name.charAt(0)}
                    </div>
                    <p style={{ fontWeight:600, fontSize:14 }}>{sp.name}</p>
                    {sp.job_title && <p style={{ fontSize:12, color:'var(--color-text-muted)', marginTop:2 }}>{sp.job_title}</p>}
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
                  <p style={{ fontSize:11, fontWeight:700, color:'var(--color-text-muted)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:12 }}>
                    {tierLabel[tier]}
                  </p>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:16, alignItems:'center' }}>
                    {group.map((sp: any) => (
                      <a
                        key={sp.id}
                        href={sp.website_url ?? undefined}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display:'flex', alignItems:'center', justifyContent:'center',
                          width: tierSize[tier] * 1.8, height: tierSize[tier],
                          border:'1px solid var(--color-border)', borderRadius:10,
                          background:'var(--color-surface)', padding:'0.5rem 1rem',
                          textDecoration:'none', overflow:'hidden',
                        }}
                      >
                        {sp.logo_url
                          ? <img src={sp.logo_url} alt={sp.name} style={{ maxWidth:'100%', maxHeight:'100%', objectFit:'contain' }} />
                          : <span style={{ fontSize:13, fontWeight:700, color:'var(--color-text)', textAlign:'center' }}>{sp.name}</span>}
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
