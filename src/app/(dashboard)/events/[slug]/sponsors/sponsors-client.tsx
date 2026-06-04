'use client'

import { useState, useTransition } from 'react'
import { createSponsor, updateSponsor, deleteSponsor } from '@/lib/sponsors/actions'
import { addSponsorContact, getSponsorContacts, sendSponsorPortalInvite } from '@/lib/sponsors/portal-actions'

type Sponsor = {
  id: string
  name: string
  slug?: string | null
  website_url: string | null
  logo_url: string | null
  tier: 'title' | 'gold' | 'silver' | 'bronze'
  sort_order: number
  is_featured: boolean
  contact_email?: string | null
}

type SponsorContact = {
  id: string
  name: string
  email: string | null
  portal_token: string
  created_at: string
}

const TIERS = [
  { value: 'title',  label: 'Title Sponsor',  color: '#7c3aed' },
  { value: 'gold',   label: 'Gold Sponsor',   color: '#d97706' },
  { value: 'silver', label: 'Silver Sponsor', color: '#6b7280' },
  { value: 'bronze', label: 'Bronze Sponsor', color: '#92400e' },
] as const

type TierValue = typeof TIERS[number]['value']

type Props = {
  eventId: string
  eventSlug: string
  sponsors: Sponsor[]
}

function SponsorForm({
  eventId,
  initial,
  onSuccess,
  onCancel,
}: {
  eventId: string
  initial?: Sponsor
  onSuccess: () => void
  onCancel: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setError(null)
    startTransition(async () => {
      const result = initial
        ? await updateSponsor(initial.id, eventId, fd)
        : await createSponsor(eventId, fd)
      if ((result as any).error) {
        setError((result as any).error)
      } else {
        onSuccess()
      }
    })
  }

  const inputStyle = {
    width: '100%',
    background: 'var(--pz-bg)',
    border: '1px solid var(--pz-border)',
    borderRadius: 8,
    padding: '8px 10px',
    fontSize: 13,
    color: 'var(--pz-text)',
    outline: 'none',
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={{ fontSize: 12, color: 'var(--pz-muted)', display: 'block', marginBottom: 4 }}>
            Name *
          </label>
          <input
            name="name"
            required
            defaultValue={initial?.name ?? ''}
            placeholder="Acme Corp"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={{ fontSize: 12, color: 'var(--pz-muted)', display: 'block', marginBottom: 4 }}>
            Tier *
          </label>
          <select name="tier" defaultValue={initial?.tier ?? 'bronze'} style={inputStyle}>
            {TIERS.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label style={{ fontSize: 12, color: 'var(--pz-muted)', display: 'block', marginBottom: 4 }}>
          Website URL
        </label>
        <input
          name="website_url"
          type="url"
          defaultValue={initial?.website_url ?? ''}
          placeholder="https://acmecorp.com"
          style={inputStyle}
        />
      </div>

      <div>
        <label style={{ fontSize: 12, color: 'var(--pz-muted)', display: 'block', marginBottom: 4 }}>
          Logo URL
        </label>
        <input
          name="logo_url"
          type="url"
          defaultValue={initial?.logo_url ?? ''}
          placeholder="https://cdn.acmecorp.com/logo.png"
          style={inputStyle}
        />
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <div>
          <label style={{ fontSize: 12, color: 'var(--pz-muted)', display: 'block', marginBottom: 4 }}>
            Sort order
          </label>
          <input
            name="sort_order"
            type="number"
            defaultValue={initial?.sort_order ?? 0}
            style={{ ...inputStyle, width: 80 }}
          />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--pz-text)', cursor: 'pointer', marginTop: 16 }}>
          <input
            name="is_featured"
            type="checkbox"
            defaultChecked={initial?.is_featured ?? false}
            style={{ width: 14, height: 14 }}
          />
          Featured
        </label>
      </div>

      {error && (
        <p style={{ fontSize: 13, color: 'var(--pz-error, var(--pz-error))' }}>{error}</p>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          style={{ background: 'var(--pz-surface-2)', color: 'var(--pz-muted)', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer' }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          style={{ background: 'var(--pz-teal)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          {pending ? 'Saving…' : initial ? 'Save changes' : 'Add sponsor'}
        </button>
      </div>
    </form>
  )
}

function TierBadge({ tier }: { tier: TierValue }) {
  const t = TIERS.find(x => x.value === tier) ?? TIERS[3]
  return (
    <span
      style={{
        background: t.color + '22',
        color: t.color,
        border: `1px solid ${t.color}44`,
        borderRadius: 12,
        padding: '1px 8px',
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}
    >
      {t.label}
    </span>
  )
}

function ContactsPanel({ sponsorId, eventSlug, sponsorSlug }: { sponsorId: string; eventSlug: string; sponsorSlug: string }) {
  const [contacts, setContacts] = useState<SponsorContact[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [adding, setAdding] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  async function loadContacts() {
    setLoading(true)
    const data = await getSponsorContacts(sponsorId)
    setContacts(data as SponsorContact[])
    setLoading(false)
  }

  if (contacts === null) {
    if (!loading) loadContacts()
    return <p style={{ fontSize: 12, color: 'var(--pz-muted)', padding: '8px 0' }}>Loading…</p>
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setAdding(true)
    const res = await addSponsorContact(sponsorId, newName, newEmail || undefined)
    if (!('error' in res)) {
      await loadContacts()
      setNewName('')
      setNewEmail('')
    }
    setAdding(false)
  }

  function copyLink(token: string) {
    const url = `${window.location.origin}/sponsor-portal/${eventSlug}/${sponsorSlug}?contact=${token}`
    navigator.clipboard.writeText(url)
    setCopied(token)
    setTimeout(() => setCopied(null), 2000)
  }

  const inp = { background: 'var(--pz-bg)', border: '1px solid var(--pz-border)', borderRadius: 6, padding: '5px 8px', fontSize: 12, color: 'var(--pz-text)', outline: 'none' }

  return (
    <div style={{ marginTop: 12, padding: '12px 16px', background: 'var(--pz-bg)', borderRadius: 8, border: '1px solid var(--pz-border)' }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--pz-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Booth Contacts</p>
      {loading && <p style={{ fontSize: 12, color: 'var(--pz-muted)' }}>Loading…</p>}
      {contacts.length === 0 && !loading && (
        <p style={{ fontSize: 12, color: 'var(--pz-muted)', marginBottom: 10 }}>No individual contacts yet. Add one to give booth staff their own portal link.</p>
      )}
      {contacts.map(c => (
        <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--pz-border)' }}>
          <div>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</span>
            {c.email && <span style={{ fontSize: 12, color: 'var(--pz-muted)', marginLeft: 8 }}>{c.email}</span>}
          </div>
          <button
            onClick={() => copyLink(c.portal_token)}
            style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid var(--pz-teal)', color: 'var(--pz-teal-ink)', background: 'transparent', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            {copied === c.portal_token ? 'Copied!' : 'Copy link'}
          </button>
        </div>
      ))}
      <form onSubmit={handleAdd} style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
        <input style={inp} placeholder="Name *" value={newName} onChange={e => setNewName(e.target.value)} required />
        <input style={inp} placeholder="Email (optional)" type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
        <button type="submit" disabled={adding || !newName.trim()} style={{ background: 'var(--pz-teal)', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: adding ? 0.6 : 1 }}>
          {adding ? '…' : '+ Add'}
        </button>
      </form>
    </div>
  )
}

export function SponsorsClient({ eventId, eventSlug, sponsors }: Props) {
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [expandedContacts, setExpandedContacts] = useState<string | null>(null)
  const [inviteStatus, setInviteStatus] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()

  async function handleSendInvite(sponsorId: string) {
    setInviteStatus(s => ({ ...s, [sponsorId]: 'sending' }))
    const result = await sendSponsorPortalInvite(sponsorId)
    if ((result as any).error) {
      setInviteStatus(s => ({ ...s, [sponsorId]: (result as any).error }))
    } else {
      setInviteStatus(s => ({ ...s, [sponsorId]: 'sent' }))
    }
  }

  function handleDelete(sponsorId: string) {
    if (!confirm('Delete this sponsor?')) return
    setDeletingId(sponsorId)
    startTransition(async () => {
      await deleteSponsor(sponsorId, eventId)
      setDeletingId(null)
    })
  }

  const grouped = TIERS.reduce<Record<string, Sponsor[]>>((acc, t) => {
    acc[t.value] = sponsors.filter(s => s.tier === t.value)
    return acc
  }, { title: [], gold: [], silver: [], bronze: [] })

  return (
    <div>
      {/* Add button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
        <button
          onClick={() => { setShowAdd(true); setEditing(null) }}
          style={{ background: 'var(--pz-teal)', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
        >
          + Add sponsor
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="pz-card p-5 mb-6">
          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--pz-text)', marginBottom: 16 }}>New sponsor</p>
          <SponsorForm
            eventId={eventId}
            onSuccess={() => setShowAdd(false)}
            onCancel={() => setShowAdd(false)}
          />
        </div>
      )}

      {/* Empty state */}
      {sponsors.length === 0 && !showAdd && (
        <div className="pz-card p-8 text-center">
          <p style={{ fontSize: 28, marginBottom: 8 }}>🏆</p>
          <p style={{ fontWeight: 700, color: 'var(--pz-text)', marginBottom: 4 }}>No sponsors yet</p>
          <p style={{ fontSize: 13, color: 'var(--pz-muted)' }}>Add sponsors to display them on your event page.</p>
        </div>
      )}

      {/* Tier sections */}
      {TIERS.map(tier => {
        const list = grouped[tier.value]
        if (list.length === 0) return null
        return (
          <div key={tier.value} style={{ marginBottom: 28 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--pz-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
              {tier.label}s ({list.length})
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {list.map(sp => (
                <div key={sp.id}>
                  {editing === sp.id ? (
                    <div className="pz-card p-5">
                      <SponsorForm
                        eventId={eventId}
                        initial={sp}
                        onSuccess={() => setEditing(null)}
                        onCancel={() => setEditing(null)}
                      />
                    </div>
                  ) : (
                    <>
                    <div className="pz-card p-4" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      {/* Logo */}
                      <div style={{
                        width: 48, height: 48, borderRadius: 8,
                        background: 'var(--pz-surface-2)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        overflow: 'hidden', flexShrink: 0,
                      }}>
                        {sp.logo_url
                          ? <img src={sp.logo_url} alt={sp.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                          : <span style={{ fontSize: 20 }}>🏢</span>}
                      </div>

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--pz-text)' }}>{sp.name}</span>
                          <TierBadge tier={sp.tier} />
                          {sp.is_featured && (
                            <span style={{ fontSize: 11, color: 'var(--pz-teal-ink)', fontWeight: 600 }}>★ Featured</span>
                          )}
                        </div>
                        {sp.website_url && (
                          <a
                            href={sp.website_url}
                            target="_blank"
                            rel="noreferrer"
                            style={{ fontSize: 12, color: 'var(--pz-muted)', textDecoration: 'none' }}
                          >
                            {sp.website_url}
                          </a>
                        )}
                      </div>

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
                        {sp.contact_email ? (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                            <button
                              onClick={() => handleSendInvite(sp.id)}
                              disabled={inviteStatus[sp.id] === 'sending'}
                              style={{ background: 'var(--pz-surface-2)', color: 'var(--pz-teal-ink)', border: '1px solid var(--pz-teal)', borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: inviteStatus[sp.id] === 'sending' ? 'not-allowed' : 'pointer', opacity: inviteStatus[sp.id] === 'sending' ? 0.6 : 1, whiteSpace: 'nowrap' }}
                            >
                              {inviteStatus[sp.id] === 'sending' ? 'Sending…' : inviteStatus[sp.id] === 'sent' ? '✓ Sent' : 'Send portal link'}
                            </button>
                            {inviteStatus[sp.id] && inviteStatus[sp.id] !== 'sending' && inviteStatus[sp.id] !== 'sent' && (
                              <span style={{ fontSize: 11, color: 'var(--pz-error)' }}>{inviteStatus[sp.id]}</span>
                            )}
                          </div>
                        ) : null}
                        <button
                          onClick={() => setExpandedContacts(expandedContacts === sp.id ? null : sp.id)}
                          style={{ background: 'var(--pz-surface-2)', color: 'var(--pz-muted)', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}
                        >
                          Contacts
                        </button>
                        <button
                          onClick={() => { setEditing(sp.id); setShowAdd(false) }}
                          style={{ background: 'var(--pz-surface-2)', color: 'var(--pz-muted)', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(sp.id)}
                          disabled={deletingId === sp.id || pending}
                          style={{ background: 'transparent', color: 'var(--pz-error, var(--pz-error))', border: '1px solid var(--pz-error, var(--pz-error))', borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: 'pointer', opacity: deletingId === sp.id ? 0.5 : 1 }}
                        >
                          {deletingId === sp.id ? '…' : 'Delete'}
                        </button>
                      </div>
                    </div>
                    {expandedContacts === sp.id && (
                      <ContactsPanel
                        sponsorId={sp.id}
                        eventSlug={eventSlug}
                        sponsorSlug={sp.slug ?? sp.id}
                      />
                    )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
