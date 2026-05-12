import { notFound } from 'next/navigation'
import { getPublicEvent } from '@/lib/public/actions'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function CertificatePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const event = await getPublicEvent(slug)
  if (!event) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div style={{ minHeight: '100vh', background: 'var(--pz-bg)' }}>
      <div style={{ background: 'var(--pz-surface)', borderBottom: '1px solid var(--pz-border)', padding: '1.25rem 1.5rem' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <Link href={`/e/${slug}`} style={{ color: 'var(--pz-teal)', textDecoration: 'none', fontSize: 13 }}>← Back to event</Link>
        </div>
      </div>
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '3rem 1.5rem', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: '1rem' }}>🎓</div>
        <h1 style={{ color: 'var(--pz-text)', fontSize: 24, fontWeight: 700, marginBottom: '0.5rem' }}>
          Certificates of Attendance
        </h1>
        {user ? (
          <p style={{ color: 'var(--pz-muted)', fontSize: 14 }}>
            Certificates for <strong style={{ color: 'var(--pz-text)' }}>{(event as any).title}</strong> will be available after the event concludes.
          </p>
        ) : (
          <>
            <p style={{ color: 'var(--pz-muted)', fontSize: 14, marginBottom: '1.5rem' }}>
              Sign in to access your certificate of attendance.
            </p>
            <Link
              href={`/login?next=/e/${slug}/certificate`}
              style={{ display: 'inline-block', background: 'var(--pz-teal)', color: '#0D1B2A', borderRadius: 8, padding: '0.625rem 1.5rem', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}
            >
              Sign in
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
