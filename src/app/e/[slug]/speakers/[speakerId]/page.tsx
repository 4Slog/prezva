import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPublicEvent, getPublicSpeaker } from '@/lib/public/actions'

export default async function SpeakerDetailPage({ params }: { params: Promise<{ slug: string; speakerId: string }> }) {
  const { slug, speakerId } = await params
  const event = await getPublicEvent(slug)
  if (!event) notFound()
  const speaker = await getPublicSpeaker(event.id, speakerId)
  if (!speaker) notFound()
  const sessions = (speaker as any).session_speakers
    ?.map((ss: any) => ss.sessions)
    .filter((s: any) => s?.is_published) ?? []
  return (
    <div style={{ minHeight:'100vh', background:'var(--pz-bg)' }}>
      <div style={{ background:'var(--pz-surface)', borderBottom:'1px solid var(--pz-border)', padding:'2rem 1.5rem' }}>
        <div style={{ maxWidth:720, margin:'0 auto' }}>
          <Link href={'/e/'+slug+'/speakers'} style={{ color:'var(--pz-teal-ink)', textDecoration:'none', fontSize:13 }}>Back to speakers</Link>
          <div style={{ display:'flex', gap:'1.5rem', alignItems:'center', marginTop:'1rem' }}>
            <div style={{ width:80, height:80, borderRadius:'50%', background:'var(--pz-surface-2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, color:'var(--pz-teal-ink)', fontWeight:700, overflow:'hidden', flexShrink:0 }}>
              {(speaker as any).photo_url ? <img src={(speaker as any).photo_url} alt={(speaker as any).name} style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : (speaker as any).name.charAt(0)}
            </div>
            <div>
              <h1 style={{ fontSize:'1.5rem', fontWeight:800, color:'var(--pz-text)' }}>{(speaker as any).name}</h1>
              {(speaker as any).job_title && <p style={{ color:'var(--pz-muted)' }}>{(speaker as any).job_title}{(speaker as any).company ? ' · '+(speaker as any).company : ''}</p>}
            </div>
          </div>
        </div>
      </div>
      <div style={{ maxWidth:720, margin:'2rem auto', padding:'0 1.5rem' }}>
        {(speaker as any).bio && (<section style={{ marginBottom:'2rem' }}><h2 style={{ fontWeight:700, marginBottom:'0.75rem' }}>About</h2><p style={{ lineHeight:1.8 }}>{(speaker as any).bio}</p></section>)}
        {sessions.length > 0 && (
          <section>
            <h2 style={{ fontWeight:700, marginBottom:'0.75rem' }}>Sessions</h2>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {sessions.map((s: any) => (
                <div key={s.id} style={{ border:'1px solid var(--pz-border)', borderRadius:10, padding:'1rem 1.25rem', background:'var(--pz-surface)' }}>
                  <p style={{ fontWeight:600 }}>{s.title}</p>
                  <p style={{ fontSize:13, color:'var(--pz-muted)', marginTop:4 }}>
                    {new Date(s.starts_at).toLocaleString('en-US',{ timeZone: (event as any).timezone ?? 'UTC', month:'short', day:'numeric', hour:'numeric', minute:'2-digit' })}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
