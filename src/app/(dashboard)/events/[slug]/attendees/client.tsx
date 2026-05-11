'use client'

import { useState, useCallback, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AttendeeTable } from '@/components/attendees/AttendeeTable'
import { AddAttendeeModal } from '@/components/attendees/AddAttendeeModal'
import { removeAttendee } from '@/lib/attendees/actions'
import type { AttendeeWithTicket, AttendeeFilters, AttendeePage } from '@/lib/attendees/actions'

interface AttendeesClientProps {
  eventId: string
  eventName: string
  initialData: AttendeePage
  tickets: { id: string; name: string }[]
}

export function AttendeesClient({ eventId, eventName, initialData, tickets }: AttendeesClientProps) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [data, setData] = useState<AttendeePage>(initialData)
  const [filters, setFilters] = useState<AttendeeFilters>({})
  const [showAdd, setShowAdd] = useState(false)

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
          <h1 className="text-2xl font-bold text-[var(--pz-text)]">{eventName}</h1>
          <p className="text-sm text-[var(--pz-muted)] mt-1">Attendee management</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="px-4 py-2 bg-[var(--pz-teal)] text-white rounded-lg hover:opacity-90 text-sm font-medium"
        >
          + Add Attendee
        </button>
      </div>

      <AttendeeTable
        attendees={data.attendees}
        total={data.total}
        page={data.page}
        totalPages={data.totalPages}
        eventId={eventId}
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
    </div>
  )
}
