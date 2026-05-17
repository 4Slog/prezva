"use client"

import { useState } from 'react'
import { createTicketType, deleteTicketType } from '@/lib/registration/ticket-actions'

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
}

function fmtPrice(cents: number, currency: string) {
  if (cents === 0) return 'Free'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100)
}

export function TicketManager({ eventId, tickets: initial, connectedAssociations = [] }: TicketManagerProps) {
  const [tickets, setTickets] = useState(initial)
  const [showForm, setShowForm] = useState(false)
  const [type, setType]         = useState('free')
  const [membershipRequired, setMembershipRequired] = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [pending, setPending]   = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const inputCls = 'w-full rounded-lg border border-[#1E3A5F] bg-[#112240] px-3 py-2 text-sm text-[#F0F4F8] focus:border-[#00BFA6] focus:outline-none focus:ring-1 focus:ring-[#00BFA6]'
  const labelCls = 'mb-1 block text-sm font-medium text-[#94A3B8]'

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
                  <p className="font-medium text-[#F0F4F8]">{t.name}</p>
                  <span className="text-xs rounded-full px-2 py-0.5 bg-[#1E3A5F] text-[#94A3B8] capitalize">
                    {t.type}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-[#64748B]">
                  <span className="text-[#00BFA6] font-semibold">{fmtPrice(t.price_cents, t.currency)}</span>
                  {t.quantity !== null && (
                    <span>{t.quantity_sold} / {t.quantity} sold</span>
                  )}
                  {t.quantity === null && <span>{t.quantity_sold} sold · unlimited</span>}
                </div>
              </div>
              <button
                onClick={() => handleDelete(t.id)}
                disabled={deleting === t.id}
                className="text-xs text-[#EF4444] hover:text-red-400 disabled:opacity-50"
              >
                {deleting === t.id ? 'Removing…' : 'Remove'}
              </button>
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className="mb-4 rounded-lg bg-[#EF4444]/10 px-4 py-3 text-sm text-[#EF4444]">{error}</p>
      )}

      {/* Add ticket form */}
      {showForm ? (
        <form onSubmit={handleCreate} className="pz-card p-5 flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-[#F0F4F8]">New ticket type</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className={labelCls}>Name *</label>
              <input name="name" required placeholder="General Admission" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Type *</label>
              <select name="type" value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
                <option value="free">Free</option>
                <option value="paid">Paid</option>
                <option value="donation">Donation</option>
              </select>
            </div>
            {type !== 'free' && (
              <div>
                <label className={labelCls}>Price (USD) *</label>
                <input name="price_cents" type="number" min="0" step="1" placeholder="2500 = $25.00" className={inputCls} />
              </div>
            )}
            <div>
              <label className={labelCls}>Quantity (blank = unlimited)</label>
              <input name="quantity" type="number" min="1" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Max per order</label>
              <input name="max_per_order" type="number" min="1" max="100" defaultValue="10" className={inputCls} />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Description</label>
              <input name="description" placeholder="Optional details" className={inputCls} />
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
              <label htmlFor="membership_required" className="text-sm text-[#94A3B8] cursor-pointer">
                Membership required (verify via connected association integration)
              </label>
            </div>
            {membershipRequired && connectedAssociations.length > 0 && (
              <div className="col-span-2">
                <label className={labelCls}>Verify against which association?</label>
                <select name="membership_provider" className={inputCls}>
                  <option value="">Any connected association</option>
                  {connectedAssociations.map(p => (
                    <option key={p} value={p}>{ASSOCIATION_LABELS[p] ?? p}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
              style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
            >
              {pending ? 'Adding…' : 'Add ticket'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-[#1E3A5F] px-4 py-2 text-sm text-[#94A3B8]"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 rounded-lg border border-dashed border-[#1E3A5F] px-4 py-3 text-sm text-[#64748B] hover:border-[#00BFA6]/40 hover:text-[#94A3B8] transition-colors w-full"
        >
          <span className="text-lg">+</span>
          Add ticket type
        </button>
      )}

      {tickets.length === 0 && !showForm && (
        <p className="mt-4 text-sm text-[#64748B]">
          No ticket types yet. Add one to open registration.
        </p>
      )}
    </div>
  )
}
