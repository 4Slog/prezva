import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyEmbeddedSession, COOKIE_NAME } from '@/lib/embedded/session'
import {
  embedGetCertificatesData,
  embedBulkIssueCertificates,
} from '@/lib/embedded/certificates-actions'
import BulkIssueButton from '@/app/(dashboard)/events/[slug]/certificates/bulk-issue-button'

interface Props {
  params: Promise<{ eventId: string }>
}

export default async function EmbedCertificatesPage({ params }: Props) {
  const { eventId } = await params

  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) redirect('/embedded/events')

  try {
    await verifyEmbeddedSession(token)
  } catch {
    redirect('/embedded/events')
  }

  let data: Awaited<ReturnType<typeof embedGetCertificatesData>>
  try {
    data = await embedGetCertificatesData(eventId)
  } catch {
    redirect('/embedded/events')
  }

  const { event, templates, issuedCountsByTemplate, totalIssued } = data
  const minPct = (event as any)?.certificate_min_session_attendance_pct ?? 60

  return (
    <div style={{ padding: '32px', maxWidth: '900px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ color: 'var(--pz-text)', fontSize: '22px', fontWeight: 700, margin: 0 }}>
            Certificates
          </h1>
          <p style={{ color: 'var(--pz-muted)', fontSize: '14px', marginTop: '4px' }}>
            Issue certificates of attendance to qualified attendees
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {totalIssued > 0 && (
            <span style={{ fontSize: 13, color: 'var(--pz-muted)' }}>
              {totalIssued} issued
            </span>
          )}
          <BulkIssueButton
            eventId={eventId}
            eligibleCount={0}
            permissions={[]}
            embed
            embedAction={embedBulkIssueCertificates}
          />
        </div>
      </div>

      {/* Config banner */}
      <div
        style={{
          background: 'var(--pz-surface)',
          border: '1px solid var(--pz-border)',
          borderRadius: '10px',
          padding: '16px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <div style={{ fontSize: '13px', color: 'var(--pz-muted)' }}>
          <span style={{ color: 'var(--pz-text)', fontWeight: 600 }}>Eligibility: </span>
          Attendees who completed ≥{minPct}% of sessions
        </div>
        <div
          style={{
            marginLeft: 'auto',
            background: (event as any)?.certificate_enabled ? 'var(--pz-teal-bg)' : 'var(--pz-border)',
            color: (event as any)?.certificate_enabled ? 'var(--pz-teal-ink)' : 'var(--pz-muted)',
            borderRadius: '20px',
            padding: '2px 10px',
            fontSize: '12px',
            fontWeight: 600,
          }}
        >
          {(event as any)?.certificate_enabled ? 'Enabled' : 'Disabled'}
        </div>
      </div>

      {/* Template list — read-only */}
      {!templates || templates.length === 0 ? (
        <div
          style={{
            background: 'var(--pz-surface)',
            border: '1px dashed var(--pz-border)',
            borderRadius: '12px',
            padding: '48px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>🎓</div>
          <h3 style={{ color: 'var(--pz-text)', margin: '0 0 8px' }}>No certificate templates yet</h3>
          <p style={{ color: 'var(--pz-muted)', fontSize: '14px', margin: 0 }}>
            A default template will be created automatically when you issue the first certificate.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {(templates as any[]).map((tmpl) => (
            <div
              key={tmpl.id}
              style={{
                background: 'var(--pz-surface)',
                border: '1px solid var(--pz-border)',
                borderRadius: '10px',
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <div style={{ flex: 1 }}>
                <span style={{ color: 'var(--pz-text)', fontWeight: 600, fontSize: '14px' }}>
                  {tmpl.name}
                </span>
              </div>
              {tmpl.is_default && (
                <span
                  style={{
                    background: 'var(--pz-teal-bg)',
                    color: 'var(--pz-teal-ink)',
                    borderRadius: '20px',
                    padding: '2px 10px',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}
                >
                  Default
                </span>
              )}
              <span style={{ fontSize: '13px', color: 'var(--pz-muted)', minWidth: '60px', textAlign: 'right' }}>
                {issuedCountsByTemplate[tmpl.id] ?? 0} issued
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
