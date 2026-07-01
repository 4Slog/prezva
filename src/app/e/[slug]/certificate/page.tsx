import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionIdentity } from '@/lib/auth/session-identity'
import Link from 'next/link'
import { CertificateClient } from './client'
import { ClaimToUnlock } from '@/components/events/ClaimToUnlock'

type Props = { params: Promise<{ slug: string }> }

export default async function CertificatePage({ params }: Props) {
  const { slug } = await params

  // Admin client: look up event to check certificate_enabled (no auth required)
  const admin = createAdminClient()
  const { data: event } = await admin
    .from('events')
    .select('id, title, certificate_enabled')
    .eq('slug', slug)
    .maybeSingle()

  const identity = await getSessionIdentity(slug)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--pz-bg)' }}>
      <div style={{ background: 'var(--pz-surface)', borderBottom: '1px solid var(--pz-border)', padding: '1.25rem 1.5rem' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <Link href={`/e/${slug}`} style={{ color: 'var(--pz-teal)', textDecoration: 'none', fontSize: 13 }}>← Back to event</Link>
        </div>
      </div>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '3rem 1.5rem' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🎓</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--pz-text)', marginBottom: 6 }}>Certificate of Attendance</h1>
          <p style={{ fontSize: 14, color: 'var(--pz-muted)' }}>{event?.title ?? slug}</p>
        </div>

        {!event?.certificate_enabled ? (
          <div style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 10, padding: '2rem', textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: 'var(--pz-muted)' }}>Certificates are not enabled for this event.</p>
          </div>
        ) : identity.type !== 'user' ? (
          <ClaimToUnlock
            reason="Create your free account to access your CE certificate."
            next={`/e/${slug}/certificate`}
            email={identity.type === 'registration' ? identity.attendeeEmail : undefined}
          />
        ) : (
          <CertificateClient eventId={event.id} />
        )}
      </div>
    </div>
  )
}
