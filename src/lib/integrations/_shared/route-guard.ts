import { NextResponse } from 'next/server'
import { assertPermission } from '@/lib/auth/assert-permission'
import { isPermissionError } from '@/lib/auth/permission-error'
import { createAdminClient } from '@/lib/supabase/admin'
import { INTEGRATIONS_PERMISSION, NOT_FOUND_OR_FORBIDDEN } from './connectable'

// O155 / G-R1. Integration adapters read and write org_integrations (tokens
// included) on the service-role client, so RLS no longer scopes them: every
// route that reaches an adapter must name an org, hold org.integrations on it,
// and prove that any event or session it acts on belongs to that same org.
// "Not allowed" and "not in this org" share one refusal, so these routes cannot
// be used to probe another org's events or integrations.

type Guarded = { ok: true; orgId: string } | { ok: false; response: NextResponse }

const forbidden = () => NextResponse.json({ error: NOT_FOUND_OR_FORBIDDEN }, { status: 403 })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function guardIntegrationOrg(orgId: unknown, userId: string): Promise<Guarded> {
  if (typeof orgId !== 'string' || !orgId) return { ok: false, response: forbidden() }
  try {
    await assertPermission(orgId, userId, INTEGRATIONS_PERMISSION)
  } catch (e) {
    if (isPermissionError(e)) return { ok: false, response: forbidden() }
    throw e
  }
  return { ok: true, orgId }
}

async function ownerOrgOf(table: 'events' | 'sessions', id: string): Promise<string | null> {
  const admin = createAdminClient()
  if (table === 'events') {
    const { data, error } = await admin.from('events').select('org_id').eq('id', id).maybeSingle()
    if (error) throw new Error(`event lookup failed: ${error.message}`)
    return data?.org_id ?? null
  }
  const { data, error } = await admin.from('sessions').select('events(org_id)').eq('id', id).maybeSingle()
  if (error) throw new Error(`session lookup failed: ${error.message}`)
  const event = (data as { events: { org_id: string | null } | null } | null)?.events
  return event?.org_id ?? null
}

// null = the event belongs to orgId; otherwise the refusal to return.
export async function guardEventInOrg(eventId: unknown, orgId: string): Promise<NextResponse | null> {
  if (typeof eventId !== 'string' || !UUID.test(eventId)) return forbidden()
  return (await ownerOrgOf('events', eventId)) === orgId ? null : forbidden()
}

export async function guardSessionInOrg(sessionId: unknown, orgId: string): Promise<NextResponse | null> {
  if (typeof sessionId !== 'string' || !UUID.test(sessionId)) return forbidden()
  return (await ownerOrgOf('sessions', sessionId)) === orgId ? null : forbidden()
}
