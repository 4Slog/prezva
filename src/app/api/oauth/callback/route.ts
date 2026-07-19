import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/get-user'
import { assertPermission } from '@/lib/auth/assert-permission'
import { ghlAdapter, REDIRECT_URI } from '@/lib/integrations/ghl/adapter'

function errorRedirect(origin: string, message: string): NextResponse {
  return NextResponse.redirect(new URL(`/dashboard?error=${encodeURIComponent(message)}`, origin))
}

export async function GET(req: NextRequest) {
  const user = await requireUser()

  const code = req.nextUrl.searchParams.get('code')
  const stateB64 = req.nextUrl.searchParams.get('state')

  if (!code || !stateB64) {
    return errorRedirect(req.nextUrl.origin, 'Invalid or missing OAuth state')
  }

  let state: { orgId: string; userId: string }
  try {
    state = JSON.parse(Buffer.from(stateB64, 'base64url').toString('utf8'))
    if (!state?.orgId) throw new Error('missing orgId')
  } catch {
    return errorRedirect(req.nextUrl.origin, 'Invalid or missing OAuth state')
  }

  try {
    await assertPermission(state.orgId, user.id, 'org.settings')
  } catch {
    return errorRedirect(req.nextUrl.origin, 'You do not have access to connect this integration')
  }

  try {
    await ghlAdapter.handleCallback(code, state.orgId, REDIRECT_URI)
  } catch (err: unknown) {
    console.error('[ghl-oauth] callback failed:', err instanceof Error ? err.message : String(err))
    return errorRedirect(req.nextUrl.origin, 'GoHighLevel connection failed')
  }

  return NextResponse.redirect(new URL('/dashboard?connected=ghl', req.nextUrl.origin))
}
