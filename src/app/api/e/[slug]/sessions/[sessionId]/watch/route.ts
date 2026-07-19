import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { enqueueGhlStageMove } from '@/lib/trigger'
import { ghlLocationIdForOrg } from '@/lib/integrations/ghl/location'
import { getGhlOrgConfig } from '@/lib/integrations/ghl/org-config'

type Params = { params: Promise<{ slug: string; sessionId: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { sessionId } = await params

  // Auth — mirrors upload/avatar pattern: returns 401 JSON, not a redirect
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Parse body — handles sendBeacon text/plain AND fetch application/json
  let body: { watchedSeconds?: unknown }
  try {
    const ct = req.headers.get('content-type') ?? ''
    body = ct.includes('application/json')
      ? await req.json()
      : JSON.parse(await req.text())
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Load session — use admin client to bypass RLS, check is_published manually
  const { data: session } = await admin
    .from('sessions')
    .select('id, event_id, starts_at, ends_at, is_published, events(org_id)')
    .eq('id', sessionId)
    .maybeSingle()

  if (!session || !session.is_published) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  // Look up caller's OWN confirmed registration — never trust a client-supplied reg id
  const { data: reg } = await admin
    .from('registrations')
    .select('id')
    .eq('event_id', session.event_id)
    .eq('user_id', user.id)
    .eq('status', 'confirmed')
    .maybeSingle()

  if (!reg) {
    return NextResponse.json({ error: 'No confirmed registration' }, { status: 403 })
  }

  // Clamp: coerce to int, floor, bound to [0, sessionDuration]
  const sessionDurationSeconds = Math.max(
    0,
    Math.floor((new Date(session.ends_at).getTime() - new Date(session.starts_at).getTime()) / 1000),
  )
  const rawWatched = Math.floor(Number(body.watchedSeconds) || 0)
  const watched = Math.max(
    0,
    Math.min(rawWatched, sessionDurationSeconds || Number.MAX_SAFE_INTEGER),
  )

  const { data, error } = await admin.rpc('record_virtual_watch', {
    p_session_id: sessionId,
    p_registration_id: reg.id,
    p_event_id: session.event_id,
    p_watched: watched,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const prior = data?.[0]?.prior_watched ?? null
  const next = data?.[0]?.new_watched ?? null
  const threshold = sessionDurationSeconds * 0.8
  if (sessionDurationSeconds > 0 && next !== null && next >= threshold && (prior === null || prior < threshold)) {
    try {
      const orgId = (session as any).events?.org_id as string | undefined
      const locationId = orgId ? await ghlLocationIdForOrg(admin, orgId) : null
      if (locationId) {
        const config = await getGhlOrgConfig(admin, orgId as string)
        if (config) {
          await enqueueGhlStageMove({ registrationId: reg.id, stageId: config.stageIds.attendedSession })
        } else {
          console.error(`[ghl] org ${orgId} is GHL-linked but has no ghl_org_config row — sync skipped`)
        }
      }
    } catch (e) {
      console.error('[watch] enqueueGhlStageMove failed:', e)
    }
  }

  return NextResponse.json({ ok: true })
}
