import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/get-user'
import { guardIntegrationOrg } from '@/lib/integrations/_shared/route-guard'
import { createAdminClient } from '@/lib/supabase/admin'

export async function PATCH(req: Request) {
  const user = await requireUser()
  const { orgId, defaultListId } = await req.json()
  if (!orgId) return NextResponse.json({ error: 'Missing orgId' }, { status: 400 })
  // O155: org_integrations is written server-side only, behind org.integrations.
  const org = await guardIntegrationOrg(orgId, user.id)
  if (!org.ok) return org.response

  const admin = createAdminClient()
  const { data: row, error: readErr } = await admin
    .from('org_integrations')
    .select('directionality_preferences')
    .eq('org_id', org.orgId)
    .eq('provider', 'mailchimp')
    .maybeSingle()
  if (readErr) return NextResponse.json({ error: 'Could not save the Mailchimp settings.' }, { status: 500 })
  if (!row) return NextResponse.json({ error: 'Mailchimp is not connected.' }, { status: 404 })
  const existing = (row.directionality_preferences as Record<string, unknown>) ?? {}
  const { error: writeErr } = await admin
    .from('org_integrations')
    .update({ directionality_preferences: { ...existing, defaultListId } })
    .eq('org_id', org.orgId)
    .eq('provider', 'mailchimp')
  if (writeErr) return NextResponse.json({ error: 'Could not save the Mailchimp settings.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
