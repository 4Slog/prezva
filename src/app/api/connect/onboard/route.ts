import { NextRequest, NextResponse } from 'next/server'
import { createOnboardingLink } from '@/lib/connect/actions'

// GET /api/connect/onboard?org_id=xxx[&refresh=true]
// Called directly (button click) or as Stripe refresh_url
export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get('org_id')
  if (!orgId) {
    return NextResponse.json({ error: 'org_id required' }, { status: 400 })
  }

  const result = await createOnboardingLink(orgId)
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.redirect(result.url)
}
