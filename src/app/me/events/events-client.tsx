'use client'

import Link from 'next/link'
import CancelRegistrationButton from '@/components/registration/cancel-button'
import { useRouter } from 'next/navigation'

interface Reg {
  id: string
  status: string
  amount_paid_cents: number | null
  ticket_types?: { name: string } | null
  events?: {
    title?: string
    slug?: string
    start_at?: string
    end_at?: string
    is_virtual?: boolean
    venue_name?: string
  } | null
}

type Tab = 'upcoming' | 'past' | 'cancelled'

interface Props {
  groups: Record<Tab, Reg[]>
  active: Tab
}

export default function MyEventsClient({ groups, active }: Props) {
  const router = useRouter()
  const list = groups[active] ?? []
  const now = new Date()

  return (
    <>
      {list.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--pz-muted)', fontSize: 14 }}>
          No {active} events.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {list.map((reg) => {
            const ev = reg.events
            const date = ev?.start_at ? new Date(ev.start_at) : null
            const endDate = ev?.end_at ? new Date(ev.end_at as string) : null
            const canCancel = date && date > now && ['confirmed', 'waitlisted'].includes(reg.status)
            return (
              <div key={reg.id} style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 10, padding: '1.25rem', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                {date && (
                  <div style={{ minWidth: 52, textAlign: 'center', background: 'var(--pz-bg)', border: '1px solid var(--pz-border)', borderRadius: 8, padding: '6px 4px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--pz-teal)', textTransform: 'uppercase', letterSpacing: 1 }}>
                      {date.toLocaleDateString('en-US', { month: 'short' })}
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--pz-text)', lineHeight: 1.1 }}>
                      {date.getDate()}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--pz-muted)' }}>
                      {date.getFullYear()}
                    </div>
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--pz-text)', marginBottom: 4 }}>{ev?.title ?? 'Event'}</p>
                  <p style={{ fontSize: 12, color: 'var(--pz-muted)', marginBottom: 6 }}>
                    {ev?.is_virtual ? 'Virtual event' : ev?.venue_name ?? 'TBA'}
                    {date && endDate ? ` · ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} – ${endDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''}
                  </p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    {reg.ticket_types?.name && (
                      <span style={{ fontSize: 11, background: 'var(--pz-teal)22', color: 'var(--pz-teal)', padding: '2px 8px', borderRadius: 4, fontWeight: 500 }}>
                        {reg.ticket_types.name}
                      </span>
                    )}
                    <span style={{ fontSize: 11, background: reg.status === 'confirmed' ? '#22c55e22' : 'var(--pz-border)', color: reg.status === 'confirmed' ? '#22c55e' : 'var(--pz-muted)', padding: '2px 8px', borderRadius: 4, fontWeight: 500, textTransform: 'capitalize' }}>
                      {reg.status}
                    </span>
                    {canCancel && (
                      <CancelRegistrationButton
                        registrationId={reg.id}
                        eventTitle={ev?.title ?? ''}
                        isPaid={(reg.amount_paid_cents ?? 0) > 0}
                        onCancelled={() => router.refresh()}
                      />
                    )}
                  </div>
                </div>
                {ev?.slug && (
                  <Link
                    href={`/e/${ev.slug}`}
                    style={{ fontSize: 13, color: 'var(--pz-teal)', textDecoration: 'none', fontWeight: 500, whiteSpace: 'nowrap' }}
                  >
                    View event →
                  </Link>
                )}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
