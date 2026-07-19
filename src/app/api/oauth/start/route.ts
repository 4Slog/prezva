import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/get-user'
import { assertPermission } from '@/lib/auth/assert-permission'
import { ghlAdapter, REDIRECT_URI } from '@/lib/integrations/ghl/adapter'

export async function GET(req: NextRequest) {
  const user = await requireUser()

  const orgId = req.nextUrl.searchParams.get('org_id')
  if (!orgId) return NextResponse.json({ error: 'org_id required' }, { status: 400 })

  try {
    await assertPermission(orgId, user.id, 'org.settings')
  } catch {
    const msg = encodeURIComponent('You do not have access to connect this integration')
    return NextResponse.redirect(new URL(`/dashboard?error=${msg}`, req.nextUrl.origin))
  }

  const state = Buffer.from(JSON.stringify({ orgId, userId: user.id })).toString('base64url')
  const authUrl = ghlAdapter.getAuthUrl(orgId, REDIRECT_URI, state)

  return NextResponse.redirect(authUrl, 302)
}
