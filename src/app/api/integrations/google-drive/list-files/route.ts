import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/get-user'
import { guardIntegrationOrg } from '@/lib/integrations/_shared/route-guard'
import { googleDriveAdapter } from '@/lib/integrations/google-drive/adapter'

export async function GET(req: NextRequest) {
  const user = await requireUser()
  const orgId = req.nextUrl.searchParams.get('orgId')
  if (!orgId) return NextResponse.json({ error: 'orgId required' }, { status: 400 })

  // O155: the adapter reads this org's token on the service-role client, so
  // the caller needs org.integrations on it.
  const org = await guardIntegrationOrg(orgId, user.id)
  if (!org.ok) return org.response

  const files = await googleDriveAdapter.listFiles(org.orgId)
  return NextResponse.json({ files })
}
