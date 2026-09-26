import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/get-user'
import { googleFormsAdapter } from '@/lib/integrations/google-forms/adapter'
import { guardEventInOrg, guardIntegrationOrg } from '@/lib/integrations/_shared/route-guard'

export async function POST(req: Request) {
  const user = await requireUser()
  const { orgId, eventId, formId } = await req.json()
  if (!orgId || !eventId || !formId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  // O155: org.integrations on the org, and the event must be that org's.
  const org = await guardIntegrationOrg(orgId, user.id)
  if (!org.ok) return org.response
  const foreign = await guardEventInOrg(eventId, org.orgId)
  if (foreign) return foreign

  const result = await googleFormsAdapter.importForm(org.orgId, eventId, formId)
  return NextResponse.json(result)
}
