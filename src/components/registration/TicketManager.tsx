"use client"

import { useState } from 'react'
import { createTicketType, deleteTicketType } from '@/lib/registration/ticket-actions'
import {
  getTicketAllowlist,
  addToTicketAllowlist,
  removeFromTicketAllowlist,
  updateTicketEmailTemplate,
} from '@/lib/registration/sprint5-actions'

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
  invite_only: boolean
  early_bird_price_cents: number | null
  early_bird_ends_at: string | null
  confirmation_email_subject: string | null
  confirmation_email_body: string | null
}

interface AllowlistEntry {
  id: string
  email: string
  created_at: string
}

interface TicketManagerProps {
  eventId: string
  tickets: Ticket[]
}

function fmtPrice(cents: number, currency: string) {
  if (cents === 0) return 'Free'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100)
}

const inputStyle = {
  background: 'var(--pz-surface)',
  border: '1px solid var(--pz-border)',
  color: 'var(--pz-text)',
}
const inputStyle2 = {
  background: 'var(--pz-surface-2)',
  border: '1px solid var(--pz-border)',
  color: 'var(--pz-text)',
}

function TicketDetailPanel({ ticket }: { ticket: Ticket }) {
  const [allowlist, setAllowlist] = useState<AllowlistEntry[] | null>(null)
  const [loadingList, setLoadingList] = useState(false)
  const [emailInput, setEmailInput] = useState('')
  const [addingEmail, setAddingEmail] = useState(false)
  const [emailSubject, setEmailSubject] = useState(ticket.confirmation_email_subject ?? '')
  const [emailBody, setEmailBody] = useState(ticket.confirmation_email_body ?? '')
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [templateSaved, setTemplateSaved] = useState(false)
  const [panelError, setPanelError] = useState<string | null>(null)

  const inputCls = 'w-full rounded-lg px-3 py-2 text-sm focus:outline-none'

  async function loadAllowlist() {
    if (allowlist !== null) return
    setLoadingList(true)
    const data = await getTicketAllowlist(ticket.id)
    setAllowlist(data as AllowlistEntry[])
    setLoadingList(false)
  }

  async function handleAddEmails() {
    const emails = emailInput.split(/[\n,]+/).map((e) => e.trim()).filter(Boolean)
    if (emails.length === 0) return
    setAddingEmail(true)
    setPanelError(null)
    const result = await addToTicketAllowlist(ticket.id, emails)
    setAddingEmail(false)
    if (result.errors.length > 0) { setPanelError(result.errors[0]); return }
    setEmailInput('')
    const updated = await getTicketAllowlist(ticket.id)
    setAllowlist(updated as AllowlistEntry[])
  }

  async function handleRemove(allowlistId: string) {
    await removeFromTicketAllowlist(allowlistId)
    setAllowlist((prev) => (prev ? prev.filter((e) => e.id !== allowlistId) : prev))
  }

  async function handleSaveTemplate() {
    setSavingTemplate(true)
    setPanelError(null)
    const result = await updateTicketEmailTemplate(ticket.id, emailSubject, emailBody)
    setSavingTemplate(false)
    if (result?.error) { setPanelError(result.error); return }
    setTemplateSaved(true)
    setTimeout(() => setTemplateSaved(false), 2000)
  }

  return (
    <div className="mt-3 space-y-5 border-t pt-4" style={{ borderColor: 'var(--pz-border)' }}>
      {/* Email template */}
      <div>
        <p className="text-xs font-semibold mb-2" style={{ color: 'var(--pz-label)' }}>Confirmation email template</p>
        <p className="text-xs mb-2" style={{ color: 'var(--pz-muted)' }}>
          Leave blank to use the default confirmation email.
        </p>
        <div className="space-y-2">
          <input
            value={emailSubject}
            onChange={(e) => setEmailSubject(e.target.value)}
            placeholder="Subject (optional)"
            className={`${inputCls}`}
            style={inputStyle2}
          />
          <textarea
            value={emailBody}
            onChange={(e) => setEmailBody(e.target.value)}
            placeholder="Body (plain text, optional)"
            rows={4}
            className={`${inputCls}`}
            style={inputStyle2}
          />
          <button
            onClick={handleSaveTemplate}
            disabled={savingTemplate}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
          >
            {savingTemplate ? 'Saving…' : templateSaved ? 'Saved!' : 'Save template'}
          </button>
        </div>
      </div>

      {/* Invite-only allowlist */}
      {ticket.invite_only && (
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--pz-label)' }}>Invite allowlist</p>
          {allowlist === null ? (
            <button
              onClick={loadAllowlist}
              disabled={loadingList}
              className="text-xs disabled:opacity-50"
              style={{ color: 'var(--pz-teal)' }}
            >
              {loadingList ? 'Loading…' : 'Load allowlist'}
            </button>
          ) : (
            <div className="space-y-2">
              <textarea
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="jane@example.com, bob@example.com"
                rows={3}
                className={`${inputCls} font-mono text-xs`}
                style={inputStyle2}
              />
              <button
                onClick={handleAddEmails}
                disabled={addingEmail || !emailInput.trim()}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
              >
                {addingEmail ? 'Adding…' : 'Add emails'}
              </button>
              {allowlist.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--pz-muted)' }}>No emails on allowlist yet.</p>
              ) : (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {allowlist.map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between rounded px-2 py-1" style={{ background: 'var(--pz-surface-2)' }}>
                      <span className="text-xs font-mono" style={{ color: 'var(--pz-text)' }}>{entry.email}</span>
                      <button
                        onClick={() => handleRemove(entry.id)}
                        className="text-xs hover:opacity-70 ml-2"
                        style={{ color: 'var(--pz-error)' }}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {panelError && (
        <p className="text-xs" style={{ color: 'var(--pz-error)' }}>{panelError}</p>
      )}
    </div>
  )
}

export function TicketManager({ eventId, tickets: initial }: TicketManagerProps) {
  const [tickets, setTickets] = useState(initial)
  const [showForm, setShowForm] = useState(false)
  const [type, setType]         = useState('free')
  const [error, setError]       = useState<string | null>(null)
  const [pending, setPending]   = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const inputCls = 'w-full rounded-lg px-3 py-2 text-sm focus:outline-none'

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
      {tickets.length > 0 && (
        <div className="mb-6 flex flex-col gap-3">
          {tickets.map((t) => (
            <div key={t.id} className="pz-card p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium" style={{ color: 'var(--pz-text)' }}>{t.name}</p>
                    <span
                      className="rounded-full px-2 py-0.5 text-xs capitalize"
                      style={{ background: 'var(--pz-surface-2)', color: 'var(--pz-muted)' }}
                    >
                      {t.type}
                    </span>
                    {t.invite_only && (
                      <span
                        className="rounded-full px-2 py-0.5 text-xs"
                        style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--pz-warning)' }}
                      >
                        Invite only
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs" style={{ color: 'var(--pz-label)' }}>
                    <span className="font-semibold" style={{ color: 'var(--pz-teal)' }}>
                      {fmtPrice(t.price_cents, t.currency)}
                    </span>
                    {t.quantity !== null
                      ? <span>{t.quantity_sold} / {t.quantity} sold</span>
                      : <span>{t.quantity_sold} sold · unlimited</span>
                    }
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
                    className="text-xs hover:opacity-70"
                    style={{ color: 'var(--pz-label)' }}
                  >
                    {expandedId === t.id ? 'Close' : 'Settings'}
                  </button>
                  <button
                    onClick={() => handleDelete(t.id)}
                    disabled={deleting === t.id}
                    className="text-xs disabled:opacity-50 hover:opacity-70"
                    style={{ color: 'var(--pz-error)' }}
                  >
                    {deleting === t.id ? 'Removing…' : 'Remove'}
                  </button>
                </div>
              </div>
              {expandedId === t.id && <TicketDetailPanel ticket={t} />}
            </div>
          ))}
        </div>
      )}

      {error && (
        <p
          className="mb-4 rounded-lg px-4 py-3 text-sm"
          style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--pz-error)' }}
        >
          {error}
        </p>
      )}

      {showForm ? (
        <form onSubmit={handleCreate} className="pz-card flex flex-col gap-4 p-5">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--pz-text)' }}>New ticket type</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--pz-muted)' }}>Name *</label>
              <input name="name" required placeholder="General Admission" className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--pz-muted)' }}>Type *</label>
              <select name="type" value={type} onChange={(e) => setType(e.target.value)} className={inputCls} style={inputStyle}>
                <option value="free">Free</option>
                <option value="paid">Paid</option>
                <option value="donation">Donation</option>
              </select>
            </div>
            {type !== 'free' && (
              <div>
                <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--pz-muted)' }}>Price (USD) *</label>
                <input name="price_cents" type="number" min="0" step="1" placeholder="2500 = $25.00" className={inputCls} style={inputStyle} />
              </div>
            )}
            <div>
              <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--pz-muted)' }}>Quantity (blank = unlimited)</label>
              <input name="quantity" type="number" min="1" className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--pz-muted)' }}>Max per order</label>
              <input name="max_per_order" type="number" min="1" max="100" defaultValue="10" className={inputCls} style={inputStyle} />
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--pz-muted)' }}>Description</label>
              <input name="description" placeholder="Optional details" className={inputCls} style={inputStyle} />
            </div>
            <div className="col-span-2">
              <label className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: 'var(--pz-muted)' }}>
                <input type="checkbox" name="invite_only" className="rounded accent-[#00BFA6]" />
                Invite only (restrict access via email allowlist)
              </label>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
            >
              {pending ? 'Adding…' : 'Add ticket'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg px-4 py-2 text-sm"
              style={{ border: '1px solid var(--pz-border)', color: 'var(--pz-muted)' }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="flex w-full items-center gap-2 rounded-lg border-dashed px-4 py-3 text-sm transition-colors"
          style={{ border: '2px dashed var(--pz-border)', color: 'var(--pz-label)' }}
        >
          <span className="text-lg">+</span>
          Add ticket type
        </button>
      )}

      {tickets.length === 0 && !showForm && (
        <p className="mt-4 text-sm" style={{ color: 'var(--pz-label)' }}>
          No ticket types yet. Add one to open registration.
        </p>
      )}
    </div>
  )
}
