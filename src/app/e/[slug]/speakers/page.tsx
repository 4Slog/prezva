import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPublicEvent, getPublicSpeakers } from '@/lib/public/actions'

const ROLE_LABELS: Record<string, string> = {
  mc: 'Emcee',
  chair: 'Program Chair',
  host: 'Host',
  speaker: 'Speakers',
  guest: 'Guests',
  vip: 'VIP Guests',
}
const ROLE_ORDER = ['mc', 'chair', 'host', 'speaker', 'guest', 'vip']

export default async function PublicSpeakersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const event = await getPublicEvent(slug)
  if (!event) notFound()
  const speakers = await getPublicSpeakers(event.id)

  // Group by event_role
  const grouped: Record<string, any[]> = {}
  for (const sp of speakers) {
    const role = (sp as any).event_role ?? 'speaker'
    if (!grouped[role]) grouped[role] = []
    grouped[role].push(sp)
  }

  const roles = ROLE_ORDER.filter(r => grouped[r]?.length)
  const allSpeakers = roles.length === 1 && roles[0] === 'speaker'

  return (
    <div style={{ minHeight:'100vh', background:'var(--pz-bg)' }}>
      <div style={{ background:'var(--pz-surface)', borderBottom:'1px solid var(--pz-border)', padding:'2rem 1.5rem' }}>
        <div style={{ maxWidth:800, margin:'0 auto' }}>
          <Link href={'/e/'+slug} style={{ color:'var(--pz-teal-ink)', textDecoration:'none', fontSize:13 }}>Back to event</Link>
          <h1 style={{ fontSize:'1.75rem', fontWeight:800, marginTop:'0.5rem', color:'var(--pz-text)' }}>Speakers</h1>
        </div>
      </div>
      <div style={{ maxWidth:800, margin:'2rem auto', padding:'0 1.5rem' }}>
        {speakers.length === 0
          ? <p style={{ color:'var(--pz-muted)', textAlign:'center', padding:'3rem 0' }}>No speakers announced yet.</p>
          : allSpeakers
            ? (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:20 }}>
                {speakers.map((sp: any) => <SpeakerCard key={sp.id} sp={sp} slug={slug} />)}
              </div>
            )
            : (
              <div style={{ display:'flex', flexDirection:'column', gap:'2rem' }}>
                {roles.map(role => (
                  <div key={role}>
                    <h2 style={{ fontSize:'0.85rem', fontWeight:700, textTransform:'uppercase', letterSpacing:1, color:'var(--pz-muted)', marginBottom:'1rem' }}>
                      {ROLE_LABELS[role] ?? role}
                    </h2>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:20 }}>
                      {grouped[role].map((sp: any) => <SpeakerCard key={sp.id} sp={sp} slug={slug} />)}
                    </div>
                  </div>
                ))}
              </div>
            )
        }
      </div>
    </div>
  )
}

function SpeakerCard({ sp, slug }: { sp: any; slug: string }) {
  return (
    <Link href={'/e/'+slug+'/speakers/'+sp.id} style={{ textDecoration:'none', color:'inherit' }}>
      <div style={{ border:'1px solid var(--pz-border)', borderRadius:14, padding:'1.5rem 1.25rem', textAlign:'center', background:'var(--pz-surface)' }}>
        <div style={{ width:72, height:72, borderRadius:'50%', background:'var(--pz-surface-2)', margin:'0 auto 1rem', display:'flex', alignItems:'center', justifyContent:'center', fontSize:26, color:'var(--pz-teal-ink)', fontWeight:700, overflow:'hidden' }}>
          {sp.photo_url ? <img src={sp.photo_url} alt={sp.name} style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : sp.name.charAt(0)}
        </div>
        <p style={{ fontWeight:700 }}>{sp.name}</p>
        {sp.job_title && <p style={{ fontSize:13, color:'var(--pz-muted)', marginTop:3 }}>{sp.job_title}</p>}
        {sp.company && sp.company !== sp.job_title && <p style={{ fontSize:13, color:'var(--pz-muted)' }}>{sp.company}</p>}
      </div>
    </Link>
  )
}
