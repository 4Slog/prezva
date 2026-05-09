import { NextRequest, NextResponse } from 'next/server'
import { getConnectStatus } from '@/lib/connect/actions'

export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get('org_id')
  if (!orgId) return NextResponse.json({ error: 'org_id required' }, { status: 400 })

  try {
    const status = await getConnectStatus(orgId)
    return NextResponse.json(status)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch status' }, { status: 500 })
  }
}
