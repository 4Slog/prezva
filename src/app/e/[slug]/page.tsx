import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPublicEvent, getPublicAgenda, getPublicSpeakers } from '@/lib/public/actions'
import { Calendar, MapPin, Users, Clock } from 'lucide-react'

export default async function PublicEventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const event = await getPublicEvent(slug)
  if (!event) notFound()
  const [sessions, speakers] = await Promise.all([
    getPublicAgenda(event.id),
    getPublicSpeakers(event.id),
  ])
  const start = new Date(event.start_at)
  const end = new Date(event.end_at)
  const fmtDate = (d: Date) => d.toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})
  const fmtTime = (d: Date) => d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})
  const location = event.venue_name ? (event.venue_city ? event.venue_name + ', ' + event.venue_city : event.venue_name) : null
  return (
    <div style={{ minHeight:'100vh', background:'var(--pz-bg)', color:'var(--pz-text)' }}>
      <div style={{ background:'var(--pz-surface)', color:'#fff', padding:'3rem 1.5rem' }}>
        <div style={{ maxWidth:800, margin:'0 auto' }}>
          <p style={{ color:'var(--pz-teal)', fontWeight:600, marginBottom:'0.5rem', textTransform:'uppercase', letterSpacing:2, fontSize:12 }}>
            {event.event_type.replace('_',' ')}
          </p>
          <h1 style={{ fontSize:'clamp(1.75rem,4vw,2.75rem)', fontWeight:800, marginBottom:'1rem' }}>{event.title}</h1>
          {event.description && <p style={{ opacity:0.85, lineHeight:1.7, maxWidth:600 }}>{event.description}</p>}
          <div style={{ display:'flex', flexWrap:'wrap', gap:'1.5rem', marginTop:'1.5rem', fontSize:14 }}>
            <span style={{ display:'flex', alignItems:'center', gap:6 }}><Calendar size={16} style={{ color:'var(--pz-teal)' }}/>{fmtDate(start)}</span>
            <span style={{ display:'flex', alignItems:'center', gap:6 }}><Clock size={16} style={{ color:'var(--pz-teal)' }}/>{fmtTime(start)} - {fmtTime(end)} {event.timezone}</span>
            {location && <span style={{ display:'flex', alignItems:'center', gap:6 }}><MapPin size={16} style={{ color:'var(--pz-teal)' }}/>{location}</span>}
            {event.capacity && <span style={{ display:'flex', alignItems:'center', gap:6 }}><Users size={16} style={{ color:'var(--pz-teal)' }}/>{event.registration_count} / {event.capacity} registered</span>}
          </div>
          <div style={{ marginTop:'2rem', display:'flex', gap:'1rem', flexWrap:'wrap' }}>
            <Link href={'/e/'+slug+'/register'} style={{ background:'var(--pz-teal)', color:'#fff', padding:'0.75rem 2rem', borderRadius:8, fontWeight:700, textDecoration:'none', fontSize:15 }}>Register Now</Link>
            <Link href={'/e/'+slug+'/agenda'} style={{ background:'rgba(255,255,255,0.1)', color:'#fff', padding:'0.75rem 2rem', borderRadius:8, fontWeight:600, textDecoration:'none', fontSize:15, border:'1px solid rgba(255,255,255,0.2)' }}>View Agenda</Link>
          </div>
        </div>
      </div>
      <div style={{ maxWidth:800, margin:'0 auto', padding:'0 1.5rem' }}>
        <div style={{ borderBottom:'1px solid var(--pz-border)', marginBottom:'2rem', display:'flex', gap:'2rem' }}>
          {[{label:'Agenda',href:'/e/'+slug+'/agenda'},{label:'Speakers',href:'/e/'+slug+'/speakers'}].map(({label,href}) => (
            <Link key={href} href={href} style={{ padding:'1rem 0', color:'var(--pz-text)', textDecoration:'none', fontSize:14, fontWeight:500 }}>{label}</Link>
          ))}
        </div>
        {sessions.length > 0 && (
          <section style={{ marginBottom:'3rem' }}>
            <h2 style={{ fontSize:'1.25rem', fontWeight:700, marginBottom:'1.25rem' }}>Featured Sessions</h2>
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {sessions.slice(0,4).map((s: any) => (
                <div key={s.id} style={{ border:'1px solid var(--pz-border)', borderRadius:10, padding:'1rem 1.25rem', background:'var(--pz-surface)', borderLeft:'4px solid '+(s.tracks?.color ?? 'var(--pz-teal)') }}>
                  <p style={{ fontWeight:600, marginBottom:4 }}>{s.title}</p>
                  <p style={{ fontSize:13, color:'var(--pz-muted)' }}>
                    {new Date(s.starts_at).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}
                    {s.tracks?.name ? ' · '+s.tracks.name : ''}
                  </p>
                </div>
              ))}
            </div>
            {sessions.length > 4 && <Link href={'/e/'+slug+'/agenda'} style={{ color:'var(--pz-teal)', textDecoration:'none', fontSize:14, marginTop:12, display:'inline-block' }}>View all {sessions.length} sessions</Link>}
          </section>
        )}
        {speakers.length > 0 && (
          <section style={{ marginBottom:'3rem' }}>
            <h2 style={{ fontSize:'1.25rem', fontWeight:700, marginBottom:'1.25rem' }}>Speakers</h2>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:16 }}>
              {speakers.map((sp: any) => (
                <Link key={sp.id} href={'/e/'+slug+'/speakers/'+sp.id} style={{ textDecoration:'none', color:'inherit' }}>
                  <div style={{ border:'1px solid var(--pz-border)', borderRadius:12, padding:'1.25rem', textAlign:'center', background:'var(--pz-surface)' }}>
                    <div style={{ width:60, height:60, borderRadius:'50%', background:'var(--pz-surface)', margin:'0 auto 0.75rem', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, color:'var(--pz-teal)', fontWeight:700, overflow:'hidden' }}>
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
      </div>
    </div>
  )
}
