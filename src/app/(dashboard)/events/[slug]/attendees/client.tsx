'use client'

import { useState, useCallback, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AttendeeTable } from '@/components/attendees/AttendeeTable'
import { AddAttendeeModal } from '@/components/attendees/AddAttendeeModal'
import { removeAttendee } from '@/lib/attendees/actions'
import { approveRegistration, rejectRegistration, promoteFromWaitlist, cancelRegistration } from '@/lib/registrations/actions'
import type { AttendeeWithTicket, AttendeeFilters, AttendeePage } from '@/lib/attendees/actions'
import { getAttendeeEngagementScores } from '@/lib/analytics/engagement-actions'
import type { AttendeeEngagement } from '@/lib/analytics/engagement-actions'

interface AttendeesClientProps {
  eventId: string
  eventSlug: string
  eventName: string
  orgId: string
  initialData: AttendeePage
  tickets: { id: string; name: string; price_cents?: number }[]
  integrations: { mailchimp: boolean; constant_contact: boolean; eventbrite: boolean }
}

export function AttendeesClient({ eventId, eventSlug, eventName, orgId, initialData, tickets, integrations }: AttendeesClientProps) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [activeTab, setActiveTab] = useState<'attendees' | 'pending' | 'waitlist' | 'engagement'>('attendees')
  const [engagementScores, setEngagementScores] = useState<AttendeeEngagement[]>([])
  const [engagementLoaded, setEngagementLoaded] = useState(false)
  const [engagementLoading, setEngagementLoading] = useState(false)
  const [pendingRegs, setPendingRegs] = useState<any[]>([])
  const [pendingLoaded, setPendingLoaded] = useState(false)
  const [pendingMsg, setPendingMsg] = useState('')
  const [waitlistRegs, setWaitlistRegs] = useState<any[]>([])
  const [waitlistLoaded, setWaitlistLoaded] = useState(false)
  const [waitlistMsg, setWaitlistMsg] = useState('')
  const [data, setData] = useState<AttendeePage>(initialData)
  const [filters, setFilters] = useState<AttendeeFilters>({})
  const [showAdd, setShowAdd] = useState(false)
  const [showEBImport, setShowEBImport] = useState(false)
  const [ebEventId, setEbEventId] = useState('')
  const [ebEvents, setEbEvents] = useState<{ id: string; name: string; startDate: string }[]>([])
  const [ebLoading, setEbLoading] = useState(false)
  const [syncTarget, setSyncTarget] = useState<'mailchimp' | 'constant_contact' | null>(null)
  const [syncListId, setSyncListId] = useState('')
  const [mailchimpLists, setMailchimpLists] = useState<{ id: string; name: string; memberCount: number }[]>([])
  const [mailchimpLoading, setMailchimpLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  async function handleEBImport() {
    if (!ebEventId.trim()) return
    setSyncing(true)
    try {
      const res = await fetch(`/api/integrations/eventbrite/import-attendees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, eventbriteEventId: ebEventId, prezvaEventId: eventId }),
      })
      const json = await res.json()
      setSyncMsg(`Imported ${json.imported}, skipped ${json.skipped}, errors ${json.errors}`)
      applyFilters({})
    } finally { setSyncing(false); setShowEBImport(false) }
  }

  async function handleMailchimpSync() {
    if (!syncListId.trim()) return
    setSyncing(true)
    try {
      const res = await fetch(`/api/integrations/mailchimp/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, eventId, listId: syncListId }),
      })
      const json = await res.json()
      setSyncMsg(`Synced ${json.synced} contacts`)
    } finally { setSyncing(false); setSyncTarget(null) }
  }

  async function handleCCSync() {
    setSyncing(true)
    try {
      const res = await fetch(`/api/integrations/constant-contact/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, eventId }),
      })
      const json = await res.json()
      setSyncMsg(`Synced ${json.synced} contacts`)
    } finally { setSyncing(false); setSyncTarget(null) }
  }

  const applyFilters = useCallback(async (newFilters: Partial<AttendeeFilters>) => {
    const merged = { ...filters, ...newFilters }
    setFilters(merged)
    const params = new URLSearchParams()
    if (merged.search) params.set('search', merged.search)
    if (merged.status) params.set('status', merged.status)
    if (merged.page) params.set('page', String(merged.page))
    const res = await fetch('/api/events/' + eventId + '/attendees?' + params.toString())
    const json = await res.json()
    setData(json)
  }, [filters, eventId])

  async function handleRemove(registrationId: string) {
    await removeAttendee(registrationId)
    applyFilters({})
  }

  function handleAdded() {
    startTransition(() => router.refresh())
    applyFilters({})
  }

  async function loadPending() {
    const res = await fetch(`/api/events/${eventId}/attendees?status=pending&pageSize=100`)
    const json = await res.json()
    setPendingRegs(json.attendees ?? [])
    setPendingLoaded(true)
  }

  async function loadWaitlist() {
    const res = await fetch(`/api/events/${eventId}/attendees?status=waitlisted&pageSize=100`)
    const json = await res.json()
    setWaitlistRegs(json.attendees ?? [])
    setWaitlistLoaded(true)
  }

  async function loadEngagement() {
    setEngagementLoading(true)
    const scores = await getAttendeeEngagementScores(eventId)
    setEngagementScores(scores)
    setEngagementLoaded(true)
    setEngagementLoading(false)
  }

  async function switchTab(tab: 'attendees' | 'pending' | 'waitlist' | 'engagement') {
    setActiveTab(tab)
    if (tab === 'pending' && !pendingLoaded) await loadPending()
    if (tab === 'waitlist' && !waitlistLoaded) await loadWaitlist()
    if (tab === 'engagement' && !engagementLoaded) await loadEngagement()
  }

  function exportEngagementCsv() {
    const headers = ['Rank', 'Name', 'Email', 'Score', 'Checked In', 'Points', 'Trivia', 'Icebreakers', 'Posts', 'Feedback']
    const rows = engagementScores.map((s, i) => [
      i + 1,
      s.attendee_name,
      s.attendee_email,
      s.score,
      s.checked_in ? 'Yes' : 'No',
      s.points,
      s.trivia_answers,
      s.icebreaker_responses,
      s.community_posts,
      s.feedback_given,
    ])
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `engagement-${eventSlug}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handlePromote(regId: string) {
    setWaitlistMsg('')
    const result = await promoteFromWaitlist(regId)
    if (result?.error) { setWaitlistMsg(result.error); return }
    setWaitlistRegs(r => r.filter(x => x.id !== regId))
    setWaitlistMsg('Attendee promoted — confirmation email sent.')
  }

  async function handleWaitlistRemove(regId: string) {
    setWaitlistMsg('')
    const result = await cancelRegistration(regId)
    if (result?.error) { setWaitlistMsg(result.error); return }
    setWaitlistRegs(r => r.filter(x => x.id !== regId))
  }

  async function handleApprove(regId: string) {
    setPendingMsg('')
    const result = await approveRegistration(regId)
    if (result?.error) { setPendingMsg(result.error); return }
    setPendingRegs(r => r.filter(x => x.id !== regId))
    setPendingMsg('Registration approved — confirmation email sent.')
  }

  async function handleReject(regId: string, reason?: string) {
    setPendingMsg('')
    const result = await rejectRegistration(regId, reason)
    if (result?.error) { setPendingMsg(result.error); return }
    setPendingRegs(r => r.filter(x => x.id !== regId))
    setPendingMsg('Registration rejected.')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">{eventName}</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">Attendee management</p>
        </div>
        <div className="flex items-center gap-2">
          {integrations.eventbrite && (
            <button
              onClick={async () => {
                setEbLoading(true)
                setShowEBImport(true)
                const res = await fetch(`/api/integrations/eventbrite/list-events?orgId=${orgId}`)
                const json = await res.json()
                setEbEvents(json.events ?? [])
                setEbLoading(false)
              }}
              className="px-3 py-2 border border-[var(--border)] text-sm rounded-lg hover:bg-[var(--surface-hover)]"
            >
              Import from Eventbrite
            </button>
          )}
          {integrations.mailchimp && (
            <button
              onClick={async () => {
                setMailchimpLoading(true)
                setSyncTarget('mailchimp')
                const res = await fetch(`/api/integrations/mailchimp/lists?orgId=${orgId}`)
                const json = await res.json()
                setMailchimpLists(json.lists ?? [])
                setMailchimpLoading(false)
              }}
              className="px-3 py-2 border border-[var(--border)] text-sm rounded-lg hover:bg-[var(--surface-hover)]"
            >
              Sync to Mailchimp
            </button>
          )}
          {integrations.constant_contact && (
            <button onClick={() => setSyncTarget('constant_contact')} className="px-3 py-2 border border-[var(--border)] text-sm rounded-lg hover:bg-[var(--surface-hover)]">
              Sync to Constant Contact
            </button>
          )}
          <button
            onClick={() => setShowAdd(true)}
            className="px-4 py-2 bg-[var(--brand-teal)] text-[var(--pz-on-accent)] rounded-lg hover:opacity-90 text-sm font-medium"
          >
            + Add Attendee
          </button>
        </div>
      </div>
      {syncMsg && <p className="text-sm text-green-600">{syncMsg}</p>}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--border)]">
        <button
          onClick={() => switchTab('attendees')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === 'attendees' ? 'border-[var(--brand-teal)] text-[var(--brand-teal)]' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
        >
          Confirmed Attendees
        </button>
        <button
          onClick={() => switchTab('pending')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === 'pending' ? 'border-[var(--brand-teal)] text-[var(--brand-teal)]' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
        >
          Pending Approvals
        </button>
        <button
          onClick={() => switchTab('waitlist')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === 'waitlist' ? 'border-[var(--brand-teal)] text-[var(--brand-teal)]' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
        >
          Waitlist
        </button>
        <button
          onClick={() => switchTab('engagement')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === 'engagement' ? 'border-[var(--brand-teal)] text-[var(--brand-teal)]' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
        >
          Engagement
        </button>
      </div>

      {activeTab === 'pending' && (
        <div className="space-y-3">
          {pendingMsg && <p className="text-sm text-[var(--brand-teal)]">{pendingMsg}</p>}
          {!pendingLoaded && <p className="text-sm text-[var(--text-secondary)]">Loading…</p>}
          {pendingLoaded && pendingRegs.length === 0 && (
            <p className="text-sm text-[var(--text-secondary)]">No pending registrations.</p>
          )}
          {pendingRegs.map((reg: any) => (
            <PendingRow key={reg.id} reg={reg} onApprove={handleApprove} onReject={handleReject} />
          ))}
        </div>
      )}

      {activeTab === 'waitlist' && (
        <div className="space-y-3">
          {waitlistMsg && <p className="text-sm text-[var(--brand-teal)]">{waitlistMsg}</p>}
          {!waitlistLoaded && <p className="text-sm text-[var(--text-secondary)]">Loading…</p>}
          {waitlistLoaded && waitlistRegs.length === 0 && (
            <p className="text-sm text-[var(--text-secondary)]">No one on the waitlist.</p>
          )}
          {waitlistRegs.map((reg: any, idx: number) => (
            <WaitlistRow key={reg.id} reg={reg} position={idx + 1} onPromote={handlePromote} onRemove={handleWaitlistRemove} />
          ))}
        </div>
      )}

      {activeTab === 'engagement' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--text-secondary)]">
              {engagementLoading ? 'Loading…' : engagementLoaded ? `${engagementScores.length} attendees scored` : ''}
            </p>
            {engagementLoaded && engagementScores.length > 0 && (
              <button
                onClick={exportEngagementCsv}
                className="px-3 py-1.5 text-xs border border-[var(--border)] rounded-lg hover:bg-[var(--surface-hover)]"
              >
                Export CSV
              </button>
            )}
          </div>
          {engagementLoaded && engagementScores.length === 0 && (
            <p className="text-sm text-[var(--text-secondary)]">No engagement data yet.</p>
          )}
          {engagementLoaded && engagementScores.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    {['#', 'Name', 'Score', 'Checked In', 'Points', 'Trivia', 'Icebreakers', 'Posts', 'Feedback'].map(h => (
                      <th key={h} className="py-2 px-3 text-left text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {engagementScores.map((s, i) => (
                    <tr key={s.registration_id} className="border-b border-[var(--border)] hover:bg-[var(--surface-hover)]">
                      <td className="py-2 px-3 text-[var(--text-secondary)] font-mono text-xs">{i + 1}</td>
                      <td className="py-2 px-3">
                        <p className="font-medium text-[var(--text-primary)]">{s.attendee_name}</p>
                        <p className="text-xs text-[var(--text-secondary)]">{s.attendee_email}</p>
                      </td>
                      <td className="py-2 px-3">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 60, height: 6, background: 'var(--pz-border)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{
                              height: '100%',
                              width: `${s.score}%`,
                              background: s.score >= 70 ? 'var(--pz-success-fill)' : s.score >= 40 ? 'var(--pz-teal)' : 'var(--pz-warning-fill)',
                              borderRadius: 3,
                            }} />
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--pz-text)', minWidth: 28 }}>{s.score}</span>
                        </div>
                      </td>
                      <td className="py-2 px-3 text-center">
                        {s.checked_in ? <span className="text-green-500">✓</span> : <span className="text-[var(--text-secondary)]">—</span>}
                      </td>
                      <td className="py-2 px-3 text-center text-[var(--text-primary)]">{s.points}</td>
                      <td className="py-2 px-3 text-center text-[var(--text-primary)]">{s.trivia_answers}</td>
                      <td className="py-2 px-3 text-center text-[var(--text-primary)]">{s.icebreaker_responses}</td>
                      <td className="py-2 px-3 text-center text-[var(--text-primary)]">{s.community_posts}</td>
                      <td className="py-2 px-3 text-center text-[var(--text-primary)]">{s.feedback_given}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'attendees' && <AttendeeTable
        attendees={data.attendees}
        total={data.total}
        page={data.page}
        totalPages={data.totalPages}
        eventId={eventId}
        eventSlug={eventSlug}
        onFilterChange={applyFilters}
        onRemove={handleRemove}
      />}

      {showAdd && (
        <AddAttendeeModal
          eventId={eventId}
          tickets={tickets}
          onClose={() => setShowAdd(false)}
          onAdded={handleAdded}
        />
      )}

      {showEBImport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--surface)] rounded-xl p-6 w-full max-w-md space-y-4">
            <h2 className="font-semibold text-lg">Import from Eventbrite</h2>
            {ebLoading ? (
              <p className="text-sm text-[var(--text-secondary)]">Loading events…</p>
            ) : ebEvents.length > 0 ? (
              <select value={ebEventId} onChange={e => setEbEventId(e.target.value)} className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm bg-[var(--surface)]">
                <option value="">Select an event…</option>
                {ebEvents.map(ev => (
                  <option key={ev.id} value={ev.id}>
                    {ev.name} ({new Date(ev.startDate).toLocaleDateString()})
                  </option>
                ))}
              </select>
            ) : (
              <input value={ebEventId} onChange={e => setEbEventId(e.target.value)} placeholder="Eventbrite Event ID" className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm" />
            )}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowEBImport(false)} className="px-4 py-2 text-sm border border-[var(--border)] rounded-lg">Cancel</button>
              <button onClick={handleEBImport} disabled={syncing || !ebEventId} className="px-4 py-2 text-sm bg-[var(--brand-teal)] text-[var(--pz-on-accent)] rounded-lg disabled:opacity-50">
                {syncing ? 'Importing...' : 'Import'}
              </button>
            </div>
          </div>
        </div>
      )}

      {syncTarget === 'mailchimp' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--surface)] rounded-xl p-6 w-full max-w-md space-y-4">
            <h2 className="font-semibold text-lg">Sync to Mailchimp</h2>
            {mailchimpLoading ? (
              <p className="text-sm text-[var(--text-secondary)]">Loading lists…</p>
            ) : mailchimpLists.length > 0 ? (
              <select value={syncListId} onChange={e => setSyncListId(e.target.value)} className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm bg-[var(--surface)]">
                <option value="">Select an audience…</option>
                {mailchimpLists.map(l => (
                  <option key={l.id} value={l.id}>{l.name} ({l.memberCount.toLocaleString()} members)</option>
                ))}
              </select>
            ) : (
              <input value={syncListId} onChange={e => setSyncListId(e.target.value)} placeholder="Mailchimp List/Audience ID" className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm" />
            )}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setSyncTarget(null)} className="px-4 py-2 text-sm border border-[var(--border)] rounded-lg">Cancel</button>
              <button onClick={handleMailchimpSync} disabled={syncing || !syncListId} className="px-4 py-2 text-sm bg-[var(--brand-teal)] text-[var(--pz-on-accent)] rounded-lg disabled:opacity-50">
                {syncing ? 'Syncing...' : 'Sync'}
              </button>
            </div>
          </div>
        </div>
      )}

      {syncTarget === 'constant_contact' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--surface)] rounded-xl p-6 w-full max-w-md space-y-4">
            <h2 className="font-semibold text-lg">Sync to Constant Contact</h2>
            <p className="text-sm text-[var(--text-secondary)]">All attendees will be synced to your Constant Contact account.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setSyncTarget(null)} className="px-4 py-2 text-sm border border-[var(--border)] rounded-lg">Cancel</button>
              <button onClick={handleCCSync} disabled={syncing} className="px-4 py-2 text-sm bg-[var(--brand-teal)] text-[var(--pz-on-accent)] rounded-lg disabled:opacity-50">
                {syncing ? 'Syncing...' : 'Sync'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function WaitlistRow({ reg, position, onPromote, onRemove }: { reg: any; position: number; onPromote: (id: string) => void; onRemove: (id: string) => void }) {
  const [loading, setLoading] = useState(false)

  async function promote() {
    setLoading(true)
    await onPromote(reg.id)
    setLoading(false)
  }

  async function remove() {
    setLoading(true)
    await onRemove(reg.id)
    setLoading(false)
  }

  return (
    <div className="flex items-center justify-between p-4 border border-[var(--border)] rounded-lg bg-[var(--surface)]">
      <div className="flex items-center gap-4">
        <span className="text-xl font-bold text-[var(--text-secondary)] w-6 text-center">{position}</span>
        <div>
          <p className="font-medium text-sm">{reg.attendee_name}</p>
          <p className="text-xs text-[var(--text-secondary)]">{reg.attendee_email} · {reg.ticket_name}</p>
          <p className="text-xs text-[var(--text-secondary)]">Joined {new Date(reg.created_at).toLocaleDateString()}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={promote} disabled={loading} className="px-3 py-1.5 text-xs bg-[var(--brand-teal)] text-[var(--pz-on-accent)] rounded hover:opacity-90 disabled:opacity-50">
          {loading ? '…' : 'Promote'}
        </button>
        <button onClick={remove} disabled={loading} className="px-3 py-1.5 text-xs border border-red-500 text-red-500 rounded hover:bg-red-50 disabled:opacity-50">
          Remove
        </button>
      </div>
    </div>
  )
}

function PendingRow({ reg, onApprove, onReject }: { reg: any; onApprove: (id: string) => void; onReject: (id: string, reason?: string) => void }) {
  const [loading, setLoading] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [reason, setReason] = useState('')

  async function approve() {
    setLoading(true)
    await onApprove(reg.id)
    setLoading(false)
  }

  async function reject() {
    setLoading(true)
    await onReject(reg.id, reason.trim() || undefined)
    setLoading(false)
  }

  return (
    <div className="flex items-center justify-between p-4 border border-[var(--border)] rounded-lg bg-[var(--surface)]">
      <div>
        <p className="font-medium text-sm">{reg.attendee_name}</p>
        <p className="text-xs text-[var(--text-secondary)]">{reg.attendee_email} · {reg.ticket_name}</p>
        <p className="text-xs text-[var(--text-secondary)]">Submitted {new Date(reg.created_at).toLocaleDateString()}</p>
      </div>
      <div className="flex items-center gap-2">
        {showReject ? (
          <div className="flex items-center gap-2">
            <input
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Reason (optional)"
              className="px-2 py-1 text-xs border border-[var(--border)] rounded bg-[var(--surface)] w-36"
            />
            <button onClick={reject} disabled={loading} className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50">Confirm</button>
            <button onClick={() => setShowReject(false)} className="px-3 py-1 text-xs border border-[var(--border)] rounded">Cancel</button>
          </div>
        ) : (
          <>
            <button onClick={approve} disabled={loading} className="px-3 py-1.5 text-xs bg-[var(--brand-teal)] text-[var(--pz-on-accent)] rounded hover:opacity-90 disabled:opacity-50">Approve</button>
            <button onClick={() => setShowReject(true)} disabled={loading} className="px-3 py-1.5 text-xs border border-red-500 text-red-500 rounded hover:bg-red-50 disabled:opacity-50">Reject</button>
          </>
        )}
      </div>
    </div>
  )
}
