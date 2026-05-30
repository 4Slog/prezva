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
  delivery_method?: string
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
  registration_invite_code?: string | null
  registration_domain_restrict?: string | null
}

interface FormField {
  id: string
  label: string
  field_type: string
  options: string[] | null
  is_required: boolean
  ticket_type_id: string | null
}

interface RegisterPageClientProps {
  event: Event
  tickets: TicketType[]
  formFields?: FormField[]
  paymentsEnabled?: boolean
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

export function RegisterPageClient({ event, tickets, formFields = [], paymentsEnabled = true }: RegisterPageClientProps) {
  // Paid tickets are unavailable if the organizer's Stripe Connect is not ready
  function isPayable(t: TicketType) {
    return t.price_cents === 0 || paymentsEnabled
  }
  const [selectedTicket, setSelectedTicket] = useState<TicketType | null>(
    tickets.length === 1 && isPayable(tickets[0]) ? tickets[0] : null,
  )
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [discountCode, setDiscountCode] = useState('')
  const [discount, setDiscount] = useState<{ discountAmountCents: number; code: string } | null>(null)
  const [discountError, setDiscountError] = useState<string | null>(null)
  const [checkingCode, setCheckingCode] = useState(false)
  const [deliveryMethodChoice, setDeliveryMethodChoice] = useState<'in_person' | 'virtual'>('in_person')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  function getQty(ticketId: string) { return quantities[ticketId] ?? 1 }
  function setQty(ticketId: string, val: number) {
    setQuantities(prev => ({ ...prev, [ticketId]: val }))
  }

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
    const qty = getQty(selectedTicket.id)
    if (selectedTicket.quantity !== null) {
      const remaining = selectedTicket.quantity - selectedTicket.quantity_sold
      if (qty > remaining) { setError(`Only ${remaining} spot${remaining !== 1 ? 's' : ''} remaining`); return }
    }
    setPending(true)
    setError(null)
    const fd = new FormData(e.currentTarget)
    const smsChecked = fd.get('sms_opt_in') === 'on'
    const phoneVal = (fd.get('attendee_phone') as string || '').trim()
    if (smsChecked && !phoneVal) {
      setError('Please enter your phone number to receive SMS updates.')
      setPending(false)
      return
    }
    fd.set('event_id', event.id)
    fd.set('ticket_type_id', selectedTicket.id)
    fd.set('quantity', String(qty))
    if (discount) fd.set('discount_code', discount.code)
    if (selectedTicket.delivery_method === 'both') {
      fd.set('delivery_method', deliveryMethodChoice)
    }
    const result = await startRegistration(fd)
    setPending(false)
    if (result?.error) setError(result.error)
    // on success: server redirects to /e/[slug]/confirmation
  }

  const selectedQty = selectedTicket ? getQty(selectedTicket.id) : 1
  const finalPrice = selectedTicket
    ? Math.max(0, (selectedTicket.price_cents - (discount?.discountAmountCents ?? 0)) * selectedQty)
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
              const unpaidUnavailable = t.price_cents > 0 && !paymentsEnabled
              const disabled = soldOut || unpaidUnavailable
              const selected = selectedTicket?.id === t.id
              return (
                <div key={t.id} className={`pz-card p-4 transition-all ${disabled ? 'opacity-50' : ''} ${selected ? 'border-[#00BFA6] pz-glow-teal' : ''}`}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => { setSelectedTicket(t); setDiscount(null); setDiscountCode('') }}
                    className="w-full text-left"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-[#F0F4F8]">{t.name}</p>
                        {t.description && <p className="text-xs text-[#94A3B8] mt-0.5">{t.description}</p>}
                        {soldOut && <p className="text-xs text-[#EF4444] mt-1">Sold out</p>}
                        {!soldOut && unpaidUnavailable && (
                          <p className="text-xs text-[#F59E0B] mt-1">Payment not yet configured for this event</p>
                        )}
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
                  {selected && !disabled && (
                    <div className="flex items-center gap-3 mt-3 pt-3 border-t border-[#1E3A5F]">
                      <span className="text-sm text-[#94A3B8]">Quantity:</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setQty(t.id, Math.max(1, getQty(t.id) - 1))}
                          className="w-7 h-7 rounded border border-[#1E3A5F] text-[#94A3B8] hover:text-[#F0F4F8] hover:border-[#00BFA6] transition-colors flex items-center justify-center text-sm"
                        >−</button>
                        <span className="w-8 text-center text-[#F0F4F8] font-medium">{getQty(t.id)}</span>
                        <button
                          type="button"
                          onClick={() => {
                            const maxQty = Math.min(10, t.quantity !== null ? t.quantity - t.quantity_sold : 10)
                            setQty(t.id, Math.min(maxQty, getQty(t.id) + 1))
                          }}
                          className="w-7 h-7 rounded border border-[#1E3A5F] text-[#94A3B8] hover:text-[#F0F4F8] hover:border-[#00BFA6] transition-colors flex items-center justify-center text-sm"
                        >+</button>
                      </div>
                      {t.price_cents > 0 && getQty(t.id) > 1 && (
                        <span className="text-xs text-[#64748B] ml-auto">
                          Subtotal: {fmtPrice(t.price_cents * getQty(t.id), t.currency)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {selectedTicket && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">

            {/* Delivery method choice (only for hybrid tickets) */}
            {selectedTicket.delivery_method === 'both' && (
              <div className="pz-card p-5">
                <h2 className="text-sm font-semibold text-[#F0F4F8] mb-3">How will you attend?</h2>
                <div className="flex gap-6">
                  <label className="flex items-center gap-2 text-sm text-[#94A3B8] cursor-pointer">
                    <input type="radio" name="delivery_method" value="in_person" checked={deliveryMethodChoice === 'in_person'} onChange={() => setDeliveryMethodChoice('in_person')} />
                    📍 In-person
                  </label>
                  <label className="flex items-center gap-2 text-sm text-[#94A3B8] cursor-pointer">
                    <input type="radio" name="delivery_method" value="virtual" checked={deliveryMethodChoice === 'virtual'} onChange={() => setDeliveryMethodChoice('virtual')} />
                    💻 Virtual
                  </label>
                </div>
              </div>
            )}

            {/* Attendee info */}
            <div className="pz-card p-5">
              <h2 className="text-sm font-semibold text-[#F0F4F8] mb-4">Your information</h2>
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>First name *</label>
                    <input name="attendee_first_name" required className={inputCls} placeholder="Jane" />
                  </div>
                  <div>
                    <label className={labelCls}>Last name *</label>
                    <input name="attendee_last_name" required className={inputCls} placeholder="Smith" />
                  </div>
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

            {/* Custom registration questions */}
            {(() => {
              const visible = formFields.filter(f =>
                f.ticket_type_id === null || f.ticket_type_id === selectedTicket.id
              )
              if (visible.length === 0) return null
              return (
                <div className="pz-card p-5">
                  <h2 className="text-sm font-semibold text-[#F0F4F8] mb-4">Additional questions</h2>
                  <div className="flex flex-col gap-4">
                    {visible.map(f => (
                      <div key={f.id}>
                        <label className={labelCls}>
                          {f.label}{f.is_required && ' *'}
                        </label>
                        {f.field_type === 'textarea' && (
                          <textarea name={`cf_${f.id}`} required={f.is_required} rows={3} className={inputCls} />
                        )}
                        {(f.field_type === 'text' || f.field_type === 'email' || f.field_type === 'phone') && (
                          <input name={`cf_${f.id}`} type={f.field_type === 'email' ? 'email' : f.field_type === 'phone' ? 'tel' : 'text'} required={f.is_required} className={inputCls} />
                        )}
                        {f.field_type === 'date' && (
                          <input name={`cf_${f.id}`} type="date" required={f.is_required} className={inputCls} />
                        )}
                        {f.field_type === 'select' && f.options && (
                          <select name={`cf_${f.id}`} required={f.is_required} className={inputCls}>
                            <option value="">Select…</option>
                            {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        )}
                        {f.field_type === 'radio' && f.options && (
                          <div className="flex flex-col gap-2 mt-1">
                            {f.options.map(o => (
                              <label key={o} className="flex items-center gap-2 text-sm text-[#94A3B8] cursor-pointer">
                                <input type="radio" name={`cf_${f.id}`} value={o} required={f.is_required} />
                                {o}
                              </label>
                            ))}
                          </div>
                        )}
                        {f.field_type === 'checkbox' && f.options && (
                          <div className="flex flex-col gap-2 mt-1">
                            {f.options.map(o => (
                              <label key={o} className="flex items-center gap-2 text-sm text-[#94A3B8] cursor-pointer">
                                <input type="checkbox" name={`cf_${f.id}`} value={o} />
                                {o}
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}

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
                <span>{selectedTicket.name}{selectedQty > 1 ? ` × ${selectedQty}` : ''}</span>
                <span>{fmtPrice(selectedTicket.price_cents * selectedQty, selectedTicket.currency)}</span>
              </div>
              {discount && (
                <div className="flex justify-between text-sm text-[#22C55E] mb-1">
                  <span>Discount ({discount.code}){selectedQty > 1 ? ` × ${selectedQty}` : ''}</span>
                  <span>−{fmtPrice(discount.discountAmountCents * selectedQty, selectedTicket.currency)}</span>
                </div>
              )}
              <div className="border-t border-[#1E3A5F] mt-2 pt-2 flex justify-between font-semibold text-[#F0F4F8]">
                <span>Total</span>
                <span className="text-[#00BFA6]">{fmtPrice(finalPrice, selectedTicket.currency)}</span>
              </div>
            </div>

            {/* Invite code field if required */}
            {event.registration_invite_code && (
              <div>
                <label className={labelCls}>Invite code *</label>
                <input
                  name="invite_code"
                  required
                  className={inputCls}
                  placeholder="Enter your invite code"
                />
                <p className="text-xs text-[#64748B] mt-1">This event requires an invite code to register.</p>
              </div>
            )}

            {/* SMS consent */}
            <div className="pz-card p-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  name="sms_opt_in"
                  defaultChecked={false}
                  className="mt-0.5 flex-shrink-0 accent-[#00BFA6]"
                />
                <span className="text-xs leading-relaxed" style={{ color: 'var(--pz-text-muted)' }}>
                  Text me event updates. I agree to receive recurring automated SMS messages from Prezva about this event (session reminders, schedule changes, and check-in confirmations) at the number above. Consent is not a condition of registration. Message frequency varies. Msg &amp; data rates may apply. Reply STOP to opt out, HELP for help. We will not share your mobile information with third parties for promotional or marketing purposes. See our{' '}
                  <a href="/privacy" className="underline" style={{ color: 'var(--pz-teal)' }}>Privacy Policy</a>{' '}and{' '}
                  <a href="/terms" className="underline" style={{ color: 'var(--pz-teal)' }}>Terms</a>.
                </span>
              </label>
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
                  ? selectedQty > 1 ? `Register ${selectedQty} tickets` : 'Complete registration'
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
