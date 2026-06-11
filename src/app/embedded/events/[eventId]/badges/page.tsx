import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyEmbeddedSession, COOKIE_NAME } from '@/lib/embedded/session'
import {
  embedGetBadgePageData,
  embedSaveAsOrgTemplate,
  embedUpdateBadgeRules,
  embedCopyTemplateToEvent,
  embedDeleteTemplate,
  embedDeleteOrgTemplate,
} from '@/lib/embedded/badges-actions'
import { BadgesClient } from '@/app/(dashboard)/events/[slug]/badges/badges-client'

interface Props {
  params: Promise<{ eventId: string }>
}

export default async function EmbedBadgesPage({ params }: Props) {
  const { eventId } = await params

  // Verify embed session exists before doing any data fetching
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) redirect('/embedded/events')

  try {
    await verifyEmbeddedSession(token)
  } catch {
    redirect('/embedded/events')
  }

  let pageData: Awaited<ReturnType<typeof embedGetBadgePageData>>
  try {
    pageData = await embedGetBadgePageData(eventId)
  } catch {
    redirect('/embedded/events')
  }

  const { orgId, eventSlug, eventTemplates, orgTemplates, badgeRules, ticketTypes } = pageData
  const printUrlBase = `/api/embedded/events/${eventId}/badges/print`

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-4">
        <a
          href="/embedded/events"
          className="text-xs"
          style={{ color: 'var(--pz-muted)' }}
        >
          ← Events
        </a>
      </div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold" style={{ color: 'var(--pz-text)' }}>Badge templates</h1>
        <a
          href={`/embedded/events/${eventId}/badges/new`}
          className="rounded-lg px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90"
          style={{ background: 'var(--pz-teal)', color: 'var(--pz-on-accent)' }}
        >
          + New badge template
        </a>
      </div>
      <BadgesClient
        eventId={eventId}
        orgId={orgId}
        eventSlug={eventSlug}
        eventTemplates={eventTemplates}
        orgTemplates={orgTemplates}
        badgeRules={badgeRules as any[]}
        ticketTypes={ticketTypes}
        embedActions={{
          saveToOrg: embedSaveAsOrgTemplate,
          copyToEvent: embedCopyTemplateToEvent,
          deleteTemplate: embedDeleteTemplate,
          deleteOrgTemplate: embedDeleteOrgTemplate,
          updateRules: embedUpdateBadgeRules,
          printUrlBase,
        }}
      />
    </div>
  )
}
