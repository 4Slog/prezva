export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { getMyIssuedCertificates } from '@/lib/certificates/actions'
import { redirect } from 'next/navigation'
import Link from 'next/link'

const GOOGLE_WALLET_ENABLED = !!(
  process.env.GOOGLE_WALLET_ISSUER_ID &&
  process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL &&
  process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_KEY
)

export default async function MyWalletPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: registrations } = await supabase
    .from('registrations')
    .select('id, status, qr_code, created_at, ticket_types(name, price_cents), events(id, title, slug, start_at, end_at, timezone, venue_name, is_virtual, status)')
    .eq('user_id', user.id)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })

  console.log('[wallet] user:', user.id, 'registrations:', registrations?.length ?? 0, JSON.stringify(registrations?.map((r:any) => ({ id: r.id, event: r.events?.title, status: r.status }))))

  const certs = await getMyIssuedCertificates()

  const now = new Date()
  const active = (registrations ?? []).filter(
    (r: any) => r.events?.start_at && new Date(r.events.start_at) >= now && r.status !== 'cancelled'
  )
  const past = (registrations ?? []).filter(
    (r: any) => r.events?.start_at && new Date(r.events.start_at) < now && r.status !== 'cancelled'
  )

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--pz-text)', marginBottom: 4 }}>Wallet</h1>
      <p style={{ fontSize: 14, color: 'var(--pz-muted)', marginBottom: 28 }}>
        Your tickets, badges, and event passes.
      </p>

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
            <TicketCard key={reg.id} reg={reg} googleWalletEnabled={GOOGLE_WALLET_ENABLED} />
          ))}
        </div>
      )}

      {past.length > 0 && (
        <>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--pz-text)', marginBottom: 12 }}>Past tickets</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {past.map((reg: any) => (
              <TicketCard key={reg.id} reg={reg} past googleWalletEnabled={false} />
            ))}
          </div>
        </>
      )}

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

function TicketCard({ reg, past, googleWalletEnabled }: { reg: any; past?: boolean; googleWalletEnabled: boolean }) {
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

      {/* Action buttons row */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Link
          href={`/e/${ev?.slug}/confirmation`}
          style={{ flex: 1, minWidth: 120, padding: '8px', textAlign: 'center', background: past ? 'var(--pz-bg)' : 'var(--pz-teal)', color: past ? 'var(--pz-muted)' : '#0D1B2A', borderRadius: 6, fontSize: 13, fontWeight: 600, textDecoration: 'none', border: '1px solid var(--pz-border)' }}
        >
          View ticket &amp; QR
        </Link>

        {!past && googleWalletEnabled && (
          <Link
            href={`/api/passes/google/${reg.id}`}
            target="_blank"
            style={{ padding: '8px 14px', background: '#1a73e8', color: '#fff', borderRadius: 6, fontSize: 13, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <GoogleWalletIcon />
            Add to Google Wallet
          </Link>
        )}

        <Link
          href={`/api/registrations/${reg.id}/calendar.ics`}
          style={{ padding: '8px 14px', background: 'var(--pz-bg)', color: 'var(--pz-muted)', borderRadius: 6, fontSize: 13, fontWeight: 500, textDecoration: 'none', border: '1px solid var(--pz-border)', whiteSpace: 'nowrap' }}
        >
          Add to calendar
        </Link>
      </div>
    </div>
  )
}

function GoogleWalletIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="white" fillOpacity="0.2"/>
      <path d="M17 9H7c-.55 0-1 .45-1 1v4c0 .55.45 1 1 1h10c.55 0 1-.45 1-1v-4c0-.55-.45-1-1-1zm-7 4H8v-2h2v2zm3 0h-2v-2h2v2zm3 0h-2v-2h2v2z" fill="white"/>
    </svg>
  )
}
