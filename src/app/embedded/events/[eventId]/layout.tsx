import type { ReactNode } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { verifyEmbeddedSession, COOKIE_NAME } from '@/lib/embedded/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { isOrgEntitled } from '@/lib/entitlements'
import { EventStatusBadge } from '@/components/events/EventStatusBadge'
import { EmbedEventTabs } from './_components/EmbedEventTabs'
import { EmbedPublishControl } from './_components/EmbedPublishControl'

interface Props {
  params: Promise<{ eventId: string }>
  children: ReactNode
}

const EVENT_TYPE_LABEL: Record<string, string> = {
  in_person: 'In person',
  virtual:   'Virtual',
  hybrid:    'Hybrid',
}

export default async function EmbedEventLayout({ params, children }: Props) {
  const { eventId } = await params
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) redirect('/embedded/events')

  let event: { id: string; title: string; status: string | null; event_type: string | null }
  let ghlLocationId = ''
  let entitled = false

  try {
    const session = await verifyEmbeddedSession(token)
    ghlLocationId = session.location_id
    const db = createAdminClient()
    const { data: link } = await db
      .from('ghl_location_links')
      .select('org_id')
      .eq('ghl_location_id', session.location_id)
      .maybeSingle()
    if (!link) redirect('/embedded/events')

    const { data } = await db
      .from('events')
      .select('id, title, status, event_type')
      .eq('id', eventId)
      .eq('org_id', link.org_id)
      .maybeSingle()
    if (!data) redirect('/embedded/events')
    event = data
    entitled = await isOrgEntitled(link.org_id)
  } catch {
    redirect('/embedded/events')
  }

  return (
    <div style={{ background: 'var(--pz-surface)' }}>
      {/* Header chrome */}
      <div className="flex flex-col gap-2 px-6 pb-2 pt-4">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--pz-muted)' }}>
          <Link
            href="/embedded/events"
            className="transition-opacity hover:opacity-75"
            style={{ color: 'var(--pz-muted)' }}
          >
            Events
          </Link>
          <span>/</span>
          <span style={{ color: 'var(--pz-text)' }}>{event.title}</span>
        </div>
        {/* Title row */}
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-base font-semibold" style={{ color: 'var(--pz-text)' }}>
            {event.title}
          </h1>
          <EventStatusBadge status={event.status ?? 'draft'} />
          {event.event_type && (
            <span
              className="rounded-full px-2 py-0.5 text-xs font-medium"
              style={{ background: 'var(--pz-surface-2)', color: 'var(--pz-muted)' }}
            >
              {EVENT_TYPE_LABEL[event.event_type] ?? event.event_type}
            </span>
          )}
          <div className="ml-auto">
            <EmbedPublishControl eventId={eventId} status={event.status ?? 'draft'} entitled={entitled} />
          </div>
        </div>
      </div>

      {/* Navigation tabs */}
      <EmbedEventTabs eventId={eventId} ghlLocationId={ghlLocationId} />

      {/* Page content */}
      <main className="px-6 py-6">{children}</main>
    </div>
  )
}
