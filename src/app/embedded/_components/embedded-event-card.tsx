'use client'

import { useState } from 'react'
import { EventStatusBadge } from '@/components/events/EventStatusBadge'
import { GhlProductPicker } from './ghl-product-picker'

interface TicketType {
  event_id: string
  name: string
  type: string | null
  price_cents: number | null
  currency: string | null
  quantity: number | null
  quantity_sold: number | null
}

interface Event {
  id: string
  title: string
  slug: string
  start_at: string
  status: string | null
  event_type: string | null
  venue_name: string | null
  venue_city: string | null
  venue_state: string | null
  capacity: number | null
  registration_count: number | null
}

interface Props {
  event: Event
  tickets: TicketType[]
}

const EVENT_TYPE_LABEL: Record<string, string> = {
  in_person: 'In person',
  virtual:   'Virtual',
  hybrid:    'Hybrid',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}

function formatPrice(priceCents: number, currency: string): string {
  if (priceCents === 0) return 'Free'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(priceCents / 100)
}

export function EmbeddedEventCard({ event, tickets }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false)

  const venueLabel = [event.venue_name, event.venue_city, event.venue_state]
    .filter(Boolean)
    .join(', ')
  const regLine = event.capacity
    ? `${event.registration_count ?? 0} / ${event.capacity} registered`
    : `${event.registration_count ?? 0} registered`

  return (
    <div
      className="flex flex-col gap-3 rounded-xl border p-4"
      style={{ borderColor: 'var(--pz-border)', background: 'var(--pz-surface)' }}
    >
      {/* Event header */}
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold" style={{ color: 'var(--pz-text)' }}>
              {event.title}
            </span>
            <EventStatusBadge status={event.status ?? 'draft'} />
            {event.event_type && (
              <span
                className="rounded-full px-2 py-0.5 text-xs font-medium"
                style={{ background: 'var(--pz-surface-2)', color: 'var(--pz-muted)' }}
              >
                {EVENT_TYPE_LABEL[event.event_type] ?? event.event_type}
              </span>
            )}
          </div>
          {/* Action links */}
          <div className="flex shrink-0 items-center gap-1.5">
            <a
              href={`/embedded/events/${event.id}`}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition-opacity hover:opacity-90"
              style={{ background: 'var(--pz-teal)', color: 'var(--pz-on-accent)' }}
            >
              Manage event →
            </a>
            <button
              onClick={() => setPickerOpen(o => !o)}
              className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-opacity hover:opacity-75"
              style={{
                border: '1px solid var(--pz-border)',
                color: pickerOpen ? 'var(--pz-teal)' : 'var(--pz-muted)',
                background: pickerOpen
                  ? 'color-mix(in srgb, var(--pz-teal) 8%, var(--pz-surface))'
                  : 'var(--pz-surface-2)',
              }}
            >
              <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5z" />
              </svg>
              Link GHL product
            </button>
          </div>
        </div>
        <p className="text-xs" style={{ color: 'var(--pz-muted)' }}>
          {formatDate(event.start_at)}
        </p>
        {venueLabel && (
          <p className="text-xs" style={{ color: 'var(--pz-muted)' }}>
            {venueLabel}
          </p>
        )}
        <p className="text-xs font-medium" style={{ color: 'var(--pz-text-2, var(--pz-muted))' }}>
          {regLine}
        </p>
      </div>

      {/* Ticket types */}
      {tickets.length > 0 && (
        <div
          className="flex flex-col gap-1.5 rounded-lg p-3"
          style={{ background: 'var(--pz-surface-2)' }}
        >
          {tickets.map((tt, i) => {
            const capacityLabel = tt.quantity == null
              ? 'Unlimited'
              : `${tt.quantity_sold ?? 0} / ${tt.quantity}`
            return (
              <div key={i} className="flex items-center justify-between gap-4">
                <span className="text-xs font-medium truncate" style={{ color: 'var(--pz-text)' }}>
                  {tt.name}
                </span>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-xs" style={{ color: 'var(--pz-muted)' }}>
                    {formatPrice(tt.price_cents ?? 0, tt.currency ?? 'usd')}
                  </span>
                  <span className="text-xs tabular-nums" style={{ color: 'var(--pz-muted)' }}>
                    {capacityLabel}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Inline picker (collapsible) */}
      {pickerOpen && (
        <div
          className="flex flex-col gap-3 rounded-xl border p-4"
          style={{ borderColor: 'var(--pz-border)', background: 'var(--pz-surface-2)' }}
        >
          <p className="text-xs font-semibold" style={{ color: 'var(--pz-text)' }}>
            Link a GHL product as a ticket type
          </p>
          <GhlProductPicker eventId={event.id} />
        </div>
      )}
    </div>
  )
}
