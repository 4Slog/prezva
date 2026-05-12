import { requireUser } from '@/lib/auth/get-user'
import { getMyRegistrations } from '@/lib/attendees/profile-actions'
import { getMyIssuedCertificates } from '@/lib/certificates/actions'
import Link from 'next/link'

export default async function MyWalletPage() {
  await requireUser()
  const [registrations, certs] = await Promise.all([
    getMyRegistrations(),
    getMyIssuedCertificates(),
  ])

  const now = new Date()
  const active = registrations.filter(
    (r: any) => r.events?.start_at && new Date(r.events.start_at) >= now && r.status !== 'cancelled'
  )
  const past = registrations.filter(
    (r: any) => r.events?.start_at && new Date(r.events.start_at) < now && r.status !== 'cancelled'
  )

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--pz-text)', marginBottom: 4 }}>Wallet</h1>
      <p style={{ fontSize: 14, color: 'var(--pz-muted)', marginBottom: 28 }}>
        Your tickets, badges, and event passes.
      </p>

      {/* Apple / Google Wallet note */}
      <div style={{ background: 'var(--pz-surface-2, var(--pz-surface))', border: '1px solid var(--pz-border)', borderRadius: 10, padding: '1rem 1.25rem', marginBottom: 28, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <span style={{ fontSize: 20 }}>ℹ</span>
        <p style={{ fontSize: 13, color: 'var(--pz-muted)', lineHeight: 1.5 }}>
          Apple Wallet and Google Wallet passes will be available once enrollment is complete.
          In the meantime, your QR code ticket is on each event&apos;s confirmation page.
        </p>
      </div>

      <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--pz-text)', marginBottom: 12 }}>
        Active tickets {active.length > 0 ? `(${active.length})` : ''}
      </h2>

      {active.length === 0 ? (
        <div style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 10, padding: '2rem', textAlign: 'center', color: 'var(--pz-muted)', fontSize: 14, marginBottom: 28 }}>
          No upcoming tickets.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
          {active.map((reg: any) => (
            <TicketCard key={reg.id} reg={reg} />
          ))}
        </div>
      )}

      {past.length > 0 && (
        <>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--pz-text)', marginBottom: 12 }}>Past tickets</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {past.map((reg: any) => (
              <TicketCard key={reg.id} reg={reg} past />
            ))}
          </div>
        </>
      )}

      {/* Certificates */}
      {certs.length > 0 && (
        <>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--pz-text)', marginBottom: 12, marginTop: 28 }}>Certificates</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {certs.map((cert: any) => {
              const ev = cert.events
              return (
                <div key={cert.id} style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-teal)', borderRadius: 10, padding: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--pz-text)', marginBottom: 3 }}>
                        🎓 {ev?.title ?? 'Event'}
                      </p>
                      <p style={{ fontSize: 12, color: 'var(--pz-muted)' }}>
                        {ev?.start_at ? new Date(ev.start_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : ''}
                        {Number(cert.ce_credit_hours) > 0 ? ` · ${cert.ce_credit_hours} CE hours` : ''}
                        {cert.sessions_attended > 0 ? ` · ${cert.sessions_attended} sessions` : ''}
                      </p>
                    </div>
                    <span style={{ fontSize: 11, background: 'var(--pz-teal)22', color: 'var(--pz-teal)', padding: '3px 8px', borderRadius: 4, fontWeight: 600 }}>
                      EARNED
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {ev?.slug && (
                      <Link
                        href={`/e/${ev.slug}/certificate`}
                        style={{ flex: 1, padding: '7px', textAlign: 'center', background: 'var(--pz-teal)', color: '#0D1B2A', borderRadius: 6, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}
                      >
                        Download PDF
                      </Link>
                    )}
                    <Link
                      href={`/verify/${cert.verification_id}`}
                      style={{ padding: '7px 14px', background: 'var(--pz-bg)', color: 'var(--pz-muted)', borderRadius: 6, fontSize: 12, fontWeight: 500, textDecoration: 'none', border: '1px solid var(--pz-border)', whiteSpace: 'nowrap' }}
                    >
                      Verify
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function TicketCard({ reg, past }: { reg: any; past?: boolean }) {
  const ev = reg.events
  return (
    <div style={{ background: 'var(--pz-surface)', border: `1px solid ${past ? 'var(--pz-border)' : 'var(--pz-teal)'}`, borderRadius: 10, padding: '1.25rem', opacity: past ? 0.7 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--pz-text)', marginBottom: 3 }}>{ev?.title ?? 'Event'}</p>
          <p style={{ fontSize: 12, color: 'var(--pz-muted)' }}>
            {ev?.start_at ? new Date(ev.start_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : ''}
            {reg.ticket_types?.name ? ` · ${reg.ticket_types.name}` : ''}
          </p>
        </div>
        {!past && (
          <span style={{ fontSize: 11, background: '#22c55e22', color: '#22c55e', padding: '3px 8px', borderRadius: 4, fontWeight: 600 }}>
            ACTIVE
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <Link
          href={`/e/${ev?.slug}/confirmation`}
          style={{ flex: 1, padding: '8px', textAlign: 'center', background: past ? 'var(--pz-bg)' : 'var(--pz-teal)', color: past ? 'var(--pz-muted)' : '#0D1B2A', borderRadius: 6, fontSize: 13, fontWeight: 600, textDecoration: 'none', border: '1px solid var(--pz-border)' }}
        >
          View ticket & QR
        </Link>
        <Link
          href={`/api/registrations/${reg.id}/calendar.ics`}
          style={{ padding: '8px 16px', background: 'var(--pz-bg)', color: 'var(--pz-muted)', borderRadius: 6, fontSize: 13, fontWeight: 500, textDecoration: 'none', border: '1px solid var(--pz-border)', whiteSpace: 'nowrap' }}
        >
          Add to calendar
        </Link>
      </div>
    </div>
  )
}
