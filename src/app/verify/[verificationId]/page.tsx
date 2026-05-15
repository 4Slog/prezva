import Image from 'next/image'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'

type Props = { params: Promise<{ verificationId: string }> }

export default async function VerifyCertificatePage({ params }: Props) {
  const { verificationId } = await params

  // Admin client: public certificate verification endpoint — lookup by verification_id
  const admin = createAdminClient()
  const { data: cert } = await admin
    .from('issued_certificates')
    .select('id, ce_credit_hours, sessions_attended, created_at, events(title, start_at, slug), registrations(attendee_name, attendee_email)')
    .eq('verification_id', verificationId)
    .maybeSingle()

  const isValid = !!cert
  const ev = cert?.events as any
  const reg = cert?.registrations as any

  return (
    <div style={{ minHeight: '100vh', background: 'var(--pz-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ maxWidth: 500, width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Link href="/" style={{ textDecoration: 'none', display: 'inline-block', marginBottom: 16 }}>
            <Image src="/logo.svg" alt="Prezva" width={108} height={20} />
          </Link>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--pz-text)', marginBottom: 4 }}>Certificate Verification</h1>
          <p style={{ fontSize: 13, color: 'var(--pz-muted)' }}>Verification ID: {verificationId}</p>
        </div>

        {isValid ? (
          <div style={{ background: 'var(--pz-surface)', border: '2px solid var(--pz-teal)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ background: 'var(--pz-teal)', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>✓</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#0D1B2A' }}>Valid Certificate</span>
            </div>
            <div style={{ padding: '1.5rem' }}>
              <Row label="Issued to" value={reg?.attendee_name ?? reg?.attendee_email ?? 'Attendee'} />
              <Row label="Event" value={ev?.title ?? 'Event'} />
              {ev?.start_at && (
                <Row label="Date" value={new Date(ev.start_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} />
              )}
              <Row label="Sessions attended" value={String(cert.sessions_attended)} />
              {Number(cert.ce_credit_hours) > 0 && (
                <Row label="CE credit hours" value={String(cert.ce_credit_hours)} />
              )}
              {cert.created_at && (
                <Row label="Issued on" value={new Date(cert.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} />
              )}
            </div>
            {ev?.slug && (
              <div style={{ padding: '0 1.5rem 1.5rem' }}>
                <Link
                  href={`/e/${ev.slug}`}
                  style={{ fontSize: 13, color: 'var(--pz-teal)', textDecoration: 'none' }}
                >
                  View event →
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div style={{ background: 'var(--pz-surface)', border: '1px solid #ef4444', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ background: '#ef444422', borderBottom: '1px solid #ef4444', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>✗</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#ef4444' }}>Certificate Not Found</span>
            </div>
            <div style={{ padding: '1.5rem' }}>
              <p style={{ fontSize: 14, color: 'var(--pz-muted)' }}>
                No certificate matching this verification ID was found. The certificate may have been revoked or the ID may be incorrect.
              </p>
            </div>
          </div>
        )}

        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--pz-muted)', marginTop: 16 }}>
          Powered by <Link href="/" style={{ color: 'var(--pz-teal)', textDecoration: 'none' }}>Prezva</Link>
        </p>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 10, marginBottom: 10, borderBottom: '1px solid var(--pz-border)' }}>
      <span style={{ fontSize: 13, color: 'var(--pz-muted)' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--pz-text)' }}>{value}</span>
    </div>
  )
}
