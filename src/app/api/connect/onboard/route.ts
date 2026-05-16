import { NextRequest, NextResponse } from 'next/server'
import { getConnectOAuthUrl } from '@/lib/connect/actions'

export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get('org_id')
  if (!orgId) return NextResponse.json({ error: 'org_id required' }, { status: 400 })

  const result = await getConnectOAuthUrl(orgId)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 })

  return NextResponse.redirect(result.url)
}
