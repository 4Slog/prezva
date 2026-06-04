import { notFound } from 'next/navigation'
import { requireEventOrgAccess } from '@/lib/auth/require-event-access'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { AttendeeActions } from './actions-client'

type Props = { params: Promise<{ slug: string; regId: string }> }

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--pz-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 14, color: value ? 'var(--pz-text)' : 'var(--pz-muted)' }}>{value ?? '—'}</p>
    </div>
  )
}

export default async function AttendeeDetailPage({ params }: Props) {
  const { slug, regId } = await params
  const { event } = await requireEventOrgAccess(slug)
  const admin = createAdminClient()

  const { data: eventExtra } = await admin
    .from('events')
    .select('timezone')
    .eq('id', event.id)
    .single()

  const { data: reg } = await admin
    .from('registrations')
    .select('*, ticket_types(name, price_cents)')
    .eq('id', regId)
    .eq('event_id', event.id)
    .maybeSingle()
  if (!reg) notFound()

  const [checkinsRes, bookmarksRes] = await Promise.all([
    admin
      .from('check_ins')
      .select('id, checked_in_at, sessions(title)')
      .eq('registration_id', regId)
      .order('checked_in_at', { ascending: true }),
    admin
      .from('session_bookmarks')
      .select('session_id, sessions(title, starts_at)')
      .eq('user_id', reg.user_id ?? '')
      .order('created_at' as any, { ascending: true }),
  ])

  const tz = (eventExtra as any)?.timezone ?? 'UTC'
  const fmtDate = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleString('en-US', { timeZone: tz, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : null

  const statusColor: Record<string, string> = {
    confirmed: '#2DD4BF',
    pending: 'var(--pz-warning-fill)',
    cancelled: 'var(--pz-error)',
    waitlisted: '#8B5CF6',
    refunded: '#6B7280',
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24, fontSize: 13 }}>
        <Link href={`/events/${slug}/attendees`} style={{ color: 'var(--pz-teal)', textDecoration: 'none' }}>
          ← Attendees
        </Link>
        <span style={{ color: 'var(--pz-border)' }}>/</span>
        <span style={{ color: 'var(--pz-text)' }}>{(reg as any).attendee_name}</span>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--pz-text)', marginBottom: 4 }}>{(reg as any).attendee_name}</h1>
          <p style={{ fontSize: 14, color: 'var(--pz-muted)' }}>{(reg as any).attendee_email}</p>
        </div>
        <span style={{
          fontSize: 12, fontWeight: 600, padding: '4px 12px', borderRadius: 20,
          background: (statusColor[(reg as any).status] ?? '#6B7280') + '22',
          color: statusColor[(reg as any).status] ?? '#6B7280',
        }}>
          {((reg as any).status as string).charAt(0).toUpperCase() + ((reg as any).status as string).slice(1)}
        </span>
      </div>

      {/* Actions */}
      <div className="pz-card p-6 mb-4">
        <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--pz-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 16 }}>Actions</h2>
        <AttendeeActions
          registrationId={regId}
          status={(reg as any).status}
          amountPaidCents={(reg as any).amount_paid_cents ?? null}
          stripeChargeId={(reg as any).stripe_charge_id ?? null}
        />
      </div>

      {/* Details grid */}
      <div className="pz-card p-6 mb-4">
        <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--pz-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 20 }}>Registration Details</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px 32px' }}>
          <Field label="Phone" value={(reg as any).attendee_phone} />
          <Field label="Company" value={(reg as any).attendee_company} />
          <Field label="Ticket" value={(reg as any).ticket_types?.name} />
          <Field label="Amount Paid" value={(reg as any).amount_paid_cents ? `$${((reg as any).amount_paid_cents / 100).toFixed(2)}` : 'Free'} />
          <Field label="Registered At" value={fmtDate((reg as any).created_at)} />
          <Field label="QR Code" value={(reg as any).qr_code?.slice(0, 16) + '…'} />
          {(reg as any).notes && <div style={{ gridColumn: '1 / -1' }}><Field label="Notes" value={(reg as any).notes} /></div>}
        </div>
      </div>

      {/* Check-ins */}
      <div className="pz-card p-6 mb-4">
        <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--pz-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 16 }}>
          Check-ins ({(checkinsRes.data ?? []).length})
        </h2>
        {(checkinsRes.data ?? []).length === 0 ? (
          <p style={{ fontSize: 14, color: 'var(--pz-muted)' }}>Not yet checked in.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(checkinsRes.data as any[]).map(ci => (
              <div key={ci.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                <span style={{ color: 'var(--pz-text)' }}>{ci.sessions?.title ?? 'Event check-in'}</span>
                <span style={{ color: 'var(--pz-muted)' }}>{fmtDate(ci.checked_in_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bookmarked sessions */}
      {(bookmarksRes.data ?? []).length > 0 && (
        <div className="pz-card p-6">
          <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--pz-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 16 }}>
            My Agenda ({(bookmarksRes.data ?? []).length} sessions)
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(bookmarksRes.data as any[]).map(b => (
              <div key={b.session_id} style={{ fontSize: 14, color: 'var(--pz-text)' }}>
                {b.sessions?.title ?? b.session_id}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
