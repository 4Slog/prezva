import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPublicEvent, getPublicSpeakers } from '@/lib/public/actions'

export default async function PublicSpeakersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const event = await getPublicEvent(slug)
  if (!event) notFound()
  const speakers = await getPublicSpeakers(event.id)
  return (
    <div style={{ minHeight:'100vh', background:'var(--color-bg)' }}>
      <div style={{ background:'var(--color-navy)', color:'#fff', padding:'2rem 1.5rem' }}>
        <div style={{ maxWidth:800, margin:'0 auto' }}>
          <Link href={'/e/'+slug} style={{ color:'var(--color-teal)', textDecoration:'none', fontSize:13 }}>Back to event</Link>
          <h1 style={{ fontSize:'1.75rem', fontWeight:800, marginTop:'0.5rem' }}>Speakers</h1>
        </div>
      </div>
      <div style={{ maxWidth:800, margin:'2rem auto', padding:'0 1.5rem' }}>
        {speakers.length === 0
          ? <p style={{ color:'var(--color-text-muted)', textAlign:'center', padding:'3rem 0' }}>No speakers announced yet.</p>
          : <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:20 }}>
              {speakers.map((sp: any) => (
                <Link key={sp.id} href={'/e/'+slug+'/speakers/'+sp.id} style={{ textDecoration:'none', color:'inherit' }}>
                  <div style={{ border:'1px solid var(--color-border)', borderRadius:14, padding:'1.5rem 1.25rem', textAlign:'center', background:'var(--color-surface)' }}>
                    <div style={{ width:72, height:72, borderRadius:'50%', background:'var(--color-navy)', margin:'0 auto 1rem', display:'flex', alignItems:'center', justifyContent:'center', fontSize:26, color:'var(--color-teal)', fontWeight:700, overflow:'hidden' }}>
                      {sp.photo_url ? <img src={sp.photo_url} alt={sp.name} style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : sp.name.charAt(0)}
                    </div>
                    <p style={{ fontWeight:700 }}>{sp.name}</p>
                    {sp.job_title && <p style={{ fontSize:13, color:'var(--color-text-muted)', marginTop:3 }}>{sp.job_title}</p>}
                    {sp.company && <p style={{ fontSize:13, color:'var(--color-text-muted)' }}>{sp.company}</p>}
                  </div>
                </Link>
              ))}
            </div>}
      </div>
    </div>
  )
}
