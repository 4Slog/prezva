'use client'

import { useState, useCallback, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AttendeeTable } from '@/components/attendees/AttendeeTable'
import { AddAttendeeModal } from '@/components/attendees/AddAttendeeModal'
import { removeAttendee } from '@/lib/attendees/actions'
import type { AttendeeWithTicket, AttendeeFilters, AttendeePage } from '@/lib/attendees/actions'

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
  const [data, setData] = useState<AttendeePage>(initialData)
  const [filters, setFilters] = useState<AttendeeFilters>({})
  const [showAdd, setShowAdd] = useState(false)
  const [showEBImport, setShowEBImport] = useState(false)
  const [ebEventId, setEbEventId] = useState('')
  const [syncTarget, setSyncTarget] = useState<'mailchimp' | 'constant_contact' | null>(null)
  const [syncListId, setSyncListId] = useState('')
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">{eventName}</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">Attendee management</p>
        </div>
        <div className="flex items-center gap-2">
          {integrations.eventbrite && (
            <button onClick={() => setShowEBImport(true)} className="px-3 py-2 border border-[var(--border)] text-sm rounded-lg hover:bg-[var(--surface-hover)]">
              Import from Eventbrite
            </button>
          )}
          {integrations.mailchimp && (
            <button onClick={() => setSyncTarget('mailchimp')} className="px-3 py-2 border border-[var(--border)] text-sm rounded-lg hover:bg-[var(--surface-hover)]">
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
            className="px-4 py-2 bg-[var(--brand-teal)] text-white rounded-lg hover:opacity-90 text-sm font-medium"
          >
            + Add Attendee
          </button>
        </div>
      </div>
      {syncMsg && <p className="text-sm text-green-600">{syncMsg}</p>}

      <AttendeeTable
        attendees={data.attendees}
        total={data.total}
        page={data.page}
        totalPages={data.totalPages}
        eventId={eventId}
        eventSlug={eventSlug}
        onFilterChange={applyFilters}
        onRemove={handleRemove}
      />

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
            <input value={ebEventId} onChange={e => setEbEventId(e.target.value)} placeholder="Eventbrite Event ID" className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowEBImport(false)} className="px-4 py-2 text-sm border border-[var(--border)] rounded-lg">Cancel</button>
              <button onClick={handleEBImport} disabled={syncing} className="px-4 py-2 text-sm bg-[var(--brand-teal)] text-white rounded-lg disabled:opacity-50">
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
            <input value={syncListId} onChange={e => setSyncListId(e.target.value)} placeholder="Mailchimp List/Audience ID" className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setSyncTarget(null)} className="px-4 py-2 text-sm border border-[var(--border)] rounded-lg">Cancel</button>
              <button onClick={handleMailchimpSync} disabled={syncing} className="px-4 py-2 text-sm bg-[var(--brand-teal)] text-white rounded-lg disabled:opacity-50">
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
              <button onClick={handleCCSync} disabled={syncing} className="px-4 py-2 text-sm bg-[var(--brand-teal)] text-white rounded-lg disabled:opacity-50">
                {syncing ? 'Syncing...' : 'Sync'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
