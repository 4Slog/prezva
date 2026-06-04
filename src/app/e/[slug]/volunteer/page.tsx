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
      <div style={{ minHeight: '100vh', background: 'var(--pz-bg)', color: 'var(--pz-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <p style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Volunteer applications are not open</p>
          <p style={{ color: 'var(--pz-muted)', fontSize: 14 }}>This event is not currently accepting volunteer applications.</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--pz-bg)', color: 'var(--pz-text)' }}>
      <header style={{ background: 'var(--pz-surface)', borderBottom: '1px solid var(--pz-border)', padding: '0.75rem 1.5rem' }}>
        <a href={`/e/${slug}`} style={{ color: 'var(--pz-teal-ink)', textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>
          ← Back to {event.title}
        </a>
      </header>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '3rem 1.5rem' }}>
        <VolunteerSignupClient eventId={event.id} eventTitle={event.title} />
      </div>
    </div>
  )
}
