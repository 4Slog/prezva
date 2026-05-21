import { createAdminClient } from '@/lib/supabase/admin'
import { VolunteerSignupClient } from './volunteer-signup-client'

type Props = {
  params: Promise<{ slug: string }>
}

export default async function VolunteerSignupPage({ params }: Props) {
  const { slug } = await params
  const admin = createAdminClient()

  const { data: event } = await admin
    .from('events')
    .select('id, title, status')
    .eq('slug', slug)
    .in('status', ['published', 'live'])
    .maybeSingle()

  if (!event) {
    return (
      <div style={{ minHeight: '100vh', background: '#0D1B2A', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <p style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Volunteer applications are not open</p>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>This event is not currently accepting volunteer applications.</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0D1B2A', color: '#fff' }}>
      <header style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '0.75rem 1.5rem' }}>
        <a href={`/e/${slug}`} style={{ color: '#00BFA6', textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>
          ← Back to {event.title}
        </a>
      </header>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '3rem 1.5rem' }}>
        <VolunteerSignupClient eventId={event.id} eventTitle={event.title} />
      </div>
    </div>
  )
}
