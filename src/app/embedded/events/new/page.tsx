import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { verifyEmbeddedSession, COOKIE_NAME } from '@/lib/embedded/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { isOrgEntitled } from '@/lib/entitlements'
import { CreateEventForm } from './create-event-form'

export default async function EmbeddedNewEventPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value

  if (!token) {
    redirect('/embedded/events')
  }

  let orgId: string
  let entitled: boolean
  try {
    const session = await verifyEmbeddedSession(token)
    const db = createAdminClient()
    const { data: link } = await db
      .from('ghl_location_links')
      .select('org_id')
      .eq('ghl_location_id', session.location_id)
      .maybeSingle()
    if (!link) redirect('/embedded/events')
    orgId = link.org_id
    entitled = await isOrgEntitled(orgId)
  } catch {
    redirect('/embedded/events')
  }

  // organizations.timezone is NOT NULL — this org row is guaranteed to
  // exist (link.org_id is a live FK) — 'UTC' here only guards the type,
  // never a real fallback path.
  const db = createAdminClient()
  const { data: orgRow } = await db.from('organizations').select('timezone').eq('id', orgId).maybeSingle()
  const orgTimezone = orgRow?.timezone ?? 'UTC'

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <Link
          href="/embedded/events"
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors hover:opacity-75"
          style={{ color: 'var(--pz-muted)', background: 'var(--pz-surface-2)' }}
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
            <path d="M9.78 12.78a.75.75 0 0 1-1.06 0L4.47 8.53a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 1.06L6.06 8l3.72 3.72a.75.75 0 0 1 0 1.06z" />
          </svg>
          Events
        </Link>
        <span style={{ color: 'var(--pz-border)' }}>/</span>
        <span className="text-xs font-medium" style={{ color: 'var(--pz-text)' }}>New event</span>
      </div>

      <div className="flex flex-col gap-0.5">
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--pz-text)' }}>
          Create event
        </h1>
        <p className="text-sm" style={{ color: 'var(--pz-muted)' }}>
          Fill in the details, then link a GHL product as your ticket type.
        </p>
      </div>

      <CreateEventForm orgId={orgId} entitled={entitled} orgTimezone={orgTimezone} />
    </div>
  )
}
