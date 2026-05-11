import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(req: Request) {
  await requireUser()
  const { orgId, defaultListId } = await req.json()
  if (!orgId) return NextResponse.json({ error: 'Missing orgId' }, { status: 400 })
  const supabase = await createClient()
  const { data: row } = await supabase
    .from('org_integrations')
    .select('directionality_preferences')
    .eq('org_id', orgId)
    .eq('provider', 'mailchimp')
    .maybeSingle()
  const existing = (row?.directionality_preferences as Record<string, unknown>) ?? {}
  await supabase
    .from('org_integrations')
    .update({ directionality_preferences: { ...existing, defaultListId } })
    .eq('org_id', orgId)
    .eq('provider', 'mailchimp')
  return NextResponse.json({ ok: true })
}
