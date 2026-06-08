"use client"

import { useState } from 'react'
import { MapPin, Monitor } from 'lucide-react'
import { createTicketType, deleteTicketType } from '@/lib/registration/ticket-actions'
import { Field } from '@/components/ui/Field'
import { Gated } from '@/components/auth/Gated'

interface Ticket {
  id: string
  name: string
  description: string | null
  type: string
  price_cents: number
  currency: string
  quantity: number | null
  quantity_sold: number
  is_visible: boolean
  sort_order: number
}

const ASSOCIATION_LABELS: Record<string, string> = {
  wildapricot: 'Wild Apricot',
  imis: 'iMIS',
  memberclicks: 'MemberClicks',
  yourmembership: 'YourMembership',
  glue_up: 'Glue Up',
  neon: 'Neon CRM',
  novi: 'Novi AMS',
}

interface TicketManagerProps {
  eventId: string
  tickets: Ticket[]
  connectedAssociations?: string[]
  permissions?: string[]
}

function fmtPrice(cents: number, currency: string) {
  if (cents === 0) return 'Free'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100)
}

export function TicketManager({ eventId, tickets: initial, connectedAssociations = [], permissions = [] }: TicketManagerProps) {
  const [tickets, setTickets] = useState(initial)
  const [showForm, setShowForm] = useState(false)
  const [type, setType]         = useState('free')
  const [membershipRequired, setMembershipRequired] = useState(false)
  const [deliveryMethod, setDeliveryMethod] = useState('in_person')
  const [error, setError]       = useState<string | null>(null)
  const [pending, setPending]   = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const inputCls = 'w-full rounded-lg border border-[var(--pz-border)] bg-[var(--pz-surface)] px-3 py-2 text-sm text-[var(--pz-text)] focus:border-[var(--pz-teal)] focus:outline-none focus:ring-1 focus:ring-[var(--pz-teal)]'
  const labelCls = 'mb-1 block text-sm font-medium text-[var(--pz-muted)]'

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true)
    setError(null)
    const fd = new FormData(e.currentTarget)
    const result = await createTicketType(eventId, fd)
    setPending(false)
    if (result?.error) { setError(result.error); return }
    if (result?.data) {
      setTickets((t) => [...t, result.data as Ticket])
      setShowForm(false)
      ;(e.target as HTMLFormElement).reset()
      setType('free')
      setDeliveryMethod('in_person')
    }
  }

  async function handleDelete(ticketId: string) {
    setDeleting(ticketId)
    const result = await deleteTicketType(ticketId, eventId)
    setDeleting(null)
    if (result?.error) { setError(result.error); return }
    setTickets((t) => t.filter((tk) => tk.id !== ticketId))
  }

  return (
    <div className="max-w-2xl">
      {/* Existing tickets */}
      {tickets.length > 0 && (
        <div className="mb-6 flex flex-col gap-3">
          {tickets.map((t) => (
            <div key={t.id} className="pz-card p-4 flex items-center justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-[var(--pz-text)]">{t.name}</p>
                  <span className="text-xs rounded-full px-2 py-0.5 bg-[var(--pz-surface-2)] text-[var(--pz-muted)] capitalize">
                    {t.type}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-[var(--pz-muted)]">
                  <span className="text-[var(--pz-teal-ink)] font-semibold">{fmtPrice(t.price_cents, t.currency)}</span>
                  {t.quantity !== null && (
                    <span>{t.quantity_sold} / {t.quantity} sold</span>
                  )}
                  {t.quantity === null && <span>{t.quantity_sold} sold · unlimited</span>}
                  <span className="inline-flex items-center gap-1">
                    {(t as any).delivery_method === 'virtual'
                      ? <><Monitor size={12} /> Virtual</>
                      : (t as any).delivery_method === 'both'
                      ? <><MapPin size={12} /><Monitor size={12} /> Hybrid</>
                      : <><MapPin size={12} /> In-person</>}
                  </span>
                </div>
              </div>
              <Gated permission="tickets.manage" perms={permissions} mode="hide">
                <button
                  onClick={() => handleDelete(t.id)}
                  disabled={deleting === t.id}
                  className="text-xs text-[var(--pz-error)] hover:text-red-400 disabled:opacity-50"
                >
                  {deleting === t.id ? 'Removing…' : 'Remove'}
                </button>
              </Gated>
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className="mb-4 rounded-lg bg-[var(--pz-error)]/10 px-4 py-3 text-sm text-[var(--pz-error)]">{error}</p>
      )}

      {/* Add ticket form */}
      {showForm ? (
        <form onSubmit={handleCreate} className="pz-card p-5 flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-[var(--pz-text)]">New ticket type</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Field label="Name" htmlFor="tkt-name" required>
                <input id="tkt-name" name="name" required placeholder="General Admission" className={inputCls} />
              </Field>
            </div>
            <Field label="Type" htmlFor="tkt-type" required>
              <select id="tkt-type" name="type" value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
                <option value="free">Free</option>
                <option value="paid">Paid</option>
                <option value="donation">Donation</option>
              </select>
            </Field>
            {type !== 'free' && (
              <Field label="Price (USD)" htmlFor="tkt-price" required>
                <input id="tkt-price" name="price_cents" type="number" min="0" step="1" placeholder="2500 = $25.00" className={inputCls} />
              </Field>
            )}
            <Field label="Quantity (blank = unlimited)" htmlFor="tkt-qty">
              <input id="tkt-qty" name="quantity" type="number" min="1" className={inputCls} />
            </Field>
            <Field label="Max per order" htmlFor="tkt-maxord">
              <input id="tkt-maxord" name="max_per_order" type="number" min="1" max="100" defaultValue="10" className={inputCls} />
            </Field>
            <Field label="Sale starts at" htmlFor="tkt-sale-start">
              <input id="tkt-sale-start" name="sale_starts_at" type="datetime-local" className={inputCls} />
            </Field>
            <Field label="Sale ends at" htmlFor="tkt-sale-end">
              <input id="tkt-sale-end" name="sale_ends_at" type="datetime-local" className={inputCls} />
            </Field>
            <div className="col-span-2">
              <Field label="Description" htmlFor="tkt-desc">
                <input id="tkt-desc" name="description" placeholder="Optional details" className={inputCls} />
              </Field>
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <input
                id="membership_required"
                name="membership_required"
                type="checkbox"
                value="true"
                checked={membershipRequired}
                onChange={e => setMembershipRequired(e.target.checked)}
                className="rounded"
              />
              <label htmlFor="membership_required" className="text-sm text-[var(--pz-muted)] cursor-pointer">
                Membership required (verify via connected association integration)
              </label>
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <input
                id="waitlist_enabled"
                name="waitlist_enabled"
                type="checkbox"
                value="true"
                className="rounded"
              />
              <label htmlFor="waitlist_enabled" className="text-sm text-[var(--pz-muted)] cursor-pointer">
                Enable waitlist (when ticket sells out, allow attendees to join waitlist)
              </label>
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Attendance type</label>
              <div className="flex gap-4 mt-1">
                <label className="flex items-center gap-1.5 text-sm text-[var(--pz-muted)] cursor-pointer">
                  <input type="radio" name="delivery_method" value="in_person" checked={deliveryMethod === 'in_person'} onChange={e => setDeliveryMethod(e.target.value)} />
                  <MapPin size={14} /> In-person
                </label>
                <label className="flex items-center gap-1.5 text-sm text-[var(--pz-muted)] cursor-pointer">
                  <input type="radio" name="delivery_method" value="virtual" checked={deliveryMethod === 'virtual'} onChange={e => setDeliveryMethod(e.target.value)} />
                  <Monitor size={14} /> Virtual
                </label>
                <label className="flex items-center gap-1.5 text-sm text-[var(--pz-muted)] cursor-pointer">
                  <input type="radio" name="delivery_method" value="both" checked={deliveryMethod === 'both'} onChange={e => setDeliveryMethod(e.target.value)} />
                  Both (attendee chooses)
                </label>
              </div>
            </div>
            {membershipRequired && connectedAssociations.length > 0 && (
              <div className="col-span-2">
                <Field label="Verify against which association?" htmlFor="tkt-memb-prov">
                  <select id="tkt-memb-prov" name="membership_provider" className={inputCls}>
                    <option value="">Any connected association</option>
                    {connectedAssociations.map(p => (
                      <option key={p} value={p}>{ASSOCIATION_LABELS[p] ?? p}</option>
                    ))}
                  </select>
                </Field>
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
              style={{ background: 'var(--pz-teal)', color: 'var(--pz-on-accent)' }}
            >
              {pending ? 'Adding…' : 'Add ticket'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-[var(--pz-border)] px-4 py-2 text-sm text-[var(--pz-muted)]"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <Gated permission="tickets.manage" perms={permissions} mode="disable">
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 rounded-lg border border-dashed border-[var(--pz-border)] px-4 py-3 text-sm text-[var(--pz-muted)] hover:border-[var(--pz-teal)]/40 hover:text-[var(--pz-muted)] transition-colors w-full"
          >
            <span className="text-lg">+</span>
            Add ticket type
          </button>
        </Gated>
      )}

      {tickets.length === 0 && !showForm && (
        <p className="mt-4 text-sm text-[var(--pz-muted)]">
          No ticket types yet. Add one to open registration.
        </p>
      )}
    </div>
  )
}
