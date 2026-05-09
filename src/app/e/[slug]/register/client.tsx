"use client"

import { useState } from "react"
import { startRegistration } from '@/lib/registration/actions'

interface TicketType {
  id: string
  name: string
  description: string | null
  type: string
  price_cents: number
  currency: string
  quantity: number | null
  quantity_sold: number
  max_per_order: number
}

interface Event {
  id: string
  title: string
  slug: string
  start_at: string
  end_at: string
  timezone: string
  venue_name: string | null
  venue_city: string | null
  venue_state: string | null
  organizations: { name: string } | null
}

interface RegisterPageClientProps {
  event: Event
  tickets: TicketType[]
}

function fmtPrice(cents: number, currency: string) {
  if (cents === 0) return 'Free'
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: currency.toUpperCase(),
  }).format(cents / 100)
}

function fmtDate(iso: string, tz: string) {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: tz, weekday: 'short', month: 'short',
    day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

export function RegisterPageClient({ event, tickets }: RegisterPageClientProps) {
  const [selectedTicket, setSelectedTicket] = useState<TicketType | null>(
    tickets.length === 1 ? tickets[0] : null,
  )
  const [discountCode, setDiscountCode] = useState('')
  const [discount, setDiscount] = useState<{ discountAmountCents: number; code: string } | null>(null)
  const [discountError, setDiscountError] = useState<string | null>(null)
  const [checkingCode, setCheckingCode] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const inputCls = 'w-full rounded-lg border border-[#1E3A5F] bg-[#112240] px-3 py-2 text-sm text-[#F0F4F8] placeholder-[#64748B] focus:border-[#00BFA6] focus:outline-none focus:ring-1 focus:ring-[#00BFA6]'
  const labelCls = 'mb-1 block text-sm font-medium text-[#94A3B8]'

  async function applyDiscount() {
    if (!selectedTicket || !discountCode.trim()) return
    setCheckingCode(true)
    setDiscountError(null)
    setDiscount(null)
    const res = await fetch(`/api/events/${event.id}/discount`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: discountCode, price_cents: selectedTicket.price_cents }),
    })
    const data = await res.json()
    setCheckingCode(false)
    if (data.valid) {
      setDiscount({ discountAmountCents: data.discountAmountCents, code: data.code })
    } else {
      setDiscountError(data.error)
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!selectedTicket) { setError('Please select a ticket'); return }
    setPending(true)
    setError(null)
    const fd = new FormData(e.currentTarget)
    fd.set('event_id', event.id)
    fd.set('ticket_type_id', selectedTicket.id)
    if (discount) fd.set('discount_code', discount.code)
    const result = await startRegistration(fd)
    setPending(false)
    if (result?.error) setError(result.error)
    // on success: server redirects to /e/[slug]/confirmation
  }

  const finalPrice = selectedTicket
    ? Math.max(0, selectedTicket.price_cents - (discount?.discountAmountCents ?? 0))
    : 0

  return (
    <div className="min-h-screen py-10 px-4" style={{ background: 'var(--pz-bg)' }}>
      <div className="mx-auto max-w-xl">

        {/* Event header */}
        <div className="pz-card p-6 mb-6">
          <h1 className="text-xl font-bold text-[#F0F4F8] mb-1">{event.title}</h1>
          <p className="text-sm text-[#94A3B8]">
            📅 {fmtDate(event.start_at, event.timezone)}
          </p>
          {(event.venue_name || event.venue_city) && (
            <p className="text-sm text-[#94A3B8]">
              📍 {[event.venue_name, event.venue_city, event.venue_state].filter(Boolean).join(', ')}
            </p>
          )}
          {event.organizations && (
            <p className="text-xs text-[#64748B] mt-2">Hosted by {event.organizations.name}</p>
          )}
        </div>

        {/* Ticket selection */}
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-[#F0F4F8] mb-3">Select a ticket</h2>
          <div className="flex flex-col gap-3">
            {tickets.map((t) => {
              const soldOut = t.quantity !== null && t.quantity_sold >= t.quantity
              const selected = selectedTicket?.id === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  disabled={soldOut}
                  onClick={() => { setSelectedTicket(t); setDiscount(null); setDiscountCode('') }}
                  className={`pz-card p-4 text-left transition-all disabled:opacity-50 ${
                    selected ? 'border-[#00BFA6] pz-glow-teal' : 'hover:border-[#00BFA6]/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-[#F0F4F8]">{t.name}</p>
                      {t.description && <p className="text-xs text-[#94A3B8] mt-0.5">{t.description}</p>}
                      {soldOut && <p className="text-xs text-[#EF4444] mt-1">Sold out</p>}
                    </div>
                    <div className="text-right ml-4 flex-shrink-0">
                      <p className="font-bold text-[#00BFA6]">{fmtPrice(t.price_cents, t.currency)}</p>
                      {t.quantity !== null && (
                        <p className="text-xs text-[#64748B]">
                          {t.quantity - t.quantity_sold} left
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {selectedTicket && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">

            {/* Attendee info */}
            <div className="pz-card p-5">
              <h2 className="text-sm font-semibold text-[#F0F4F8] mb-4">Your information</h2>
              <div className="flex flex-col gap-4">
                <div>
                  <label className={labelCls}>Full name *</label>
                  <input name="attendee_name" required className={inputCls} placeholder="Jane Smith" />
                </div>
                <div>
                  <label className={labelCls}>Email address *</label>
                  <input name="attendee_email" type="email" required className={inputCls} placeholder="jane@example.com" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Phone</label>
                    <input name="attendee_phone" type="tel" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Company</label>
                    <input name="attendee_company" className={inputCls} />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Job title</label>
                  <input name="attendee_job_title" className={inputCls} />
                </div>
              </div>
            </div>

            {/* Discount code */}
            {selectedTicket.price_cents > 0 && (
              <div className="pz-card p-5">
                <h2 className="text-sm font-semibold text-[#F0F4F8] mb-3">Discount code</h2>
                <div className="flex gap-2">
                  <input
                    value={discountCode}
                    onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                    placeholder="ENTER CODE"
                    className={`${inputCls} flex-1 font-mono tracking-wider`}
                  />
                  <button
                    type="button"
                    onClick={applyDiscount}
                    disabled={checkingCode || !discountCode.trim()}
                    className="rounded-lg border border-[#1E3A5F] px-4 py-2 text-sm font-medium text-[#94A3B8] hover:text-[#F0F4F8] disabled:opacity-50"
                  >
                    {checkingCode ? '…' : 'Apply'}
                  </button>
                </div>
                {discountError && <p className="mt-1 text-xs text-[#EF4444]">{discountError}</p>}
                {discount && (
                  <p className="mt-1 text-xs text-[#22C55E]">
                    ✓ Discount applied — saving {fmtPrice(discount.discountAmountCents, selectedTicket.currency)}
                  </p>
                )}
              </div>
            )}

            {/* Order summary */}
            <div className="pz-card p-5">
              <h2 className="text-sm font-semibold text-[#F0F4F8] mb-3">Order summary</h2>
              <div className="flex justify-between text-sm text-[#94A3B8] mb-1">
                <span>{selectedTicket.name}</span>
                <span>{fmtPrice(selectedTicket.price_cents, selectedTicket.currency)}</span>
              </div>
              {discount && (
                <div className="flex justify-between text-sm text-[#22C55E] mb-1">
                  <span>Discount ({discount.code})</span>
                  <span>−{fmtPrice(discount.discountAmountCents, selectedTicket.currency)}</span>
                </div>
              )}
              <div className="border-t border-[#1E3A5F] mt-2 pt-2 flex justify-between font-semibold text-[#F0F4F8]">
                <span>Total</span>
                <span className="text-[#00BFA6]">{fmtPrice(finalPrice, selectedTicket.currency)}</span>
              </div>
            </div>

            {error && (
              <p className="rounded-lg bg-[#EF4444]/10 px-4 py-3 text-sm text-[#EF4444]">{error}</p>
            )}

            <button
              type="submit"
              disabled={pending}
              className="rounded-lg py-3 text-sm font-bold disabled:opacity-50 transition-opacity"
              style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
            >
              {pending
                ? 'Processing…'
                : finalPrice === 0
                  ? 'Complete registration'
                  : `Pay ${fmtPrice(finalPrice, selectedTicket.currency)}`}
            </button>

            <p className="text-center text-xs text-[#64748B]">
              Payments secured by Stripe. Your QR code will be emailed upon confirmation.
            </p>
          </form>
        )}

        {tickets.length === 0 && (
          <div className="pz-card p-8 text-center">
            <p className="text-[#94A3B8]">No tickets are currently available for this event.</p>
          </div>
        )}
      </div>
    </div>
  )
}
