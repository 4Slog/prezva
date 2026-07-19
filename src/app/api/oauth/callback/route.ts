import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { timingSafeEqual } from 'crypto'
import { requireUser } from '@/lib/auth/get-user'
import { assertPermission } from '@/lib/auth/assert-permission'
import { ghlAdapter, REDIRECT_URI, STATE_COOKIE } from '@/lib/integrations/ghl/adapter'

function errorRedirect(origin: string, message: string): NextResponse {
  return NextResponse.redirect(new URL(`/dashboard?error=${encodeURIComponent(message)}`, origin))
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

export async function GET(req: NextRequest) {
  const user = await requireUser()

  const code = req.nextUrl.searchParams.get('code')
  const stateB64 = req.nextUrl.searchParams.get('state')

  // Read + clear the nonce cookie unconditionally, before any validation, so a
  // captured callback URL can never be replayed once this request completes.
  const cookieStore = await cookies()
  const cookieNonce = cookieStore.get(STATE_COOKIE)?.value
  cookieStore.delete(STATE_COOKIE)

  if (!code || !stateB64 || !cookieNonce) {
    return errorRedirect(req.nextUrl.origin, 'Invalid or missing OAuth state')
  }

  let state: { orgId: string; userId: string; nonce: string }
  try {
    state = JSON.parse(Buffer.from(stateB64, 'base64url').toString('utf8'))
    if (!state?.orgId || !state?.nonce) throw new Error('missing orgId or nonce')
  } catch {
    return errorRedirect(req.nextUrl.origin, 'Invalid or missing OAuth state')
  }

  // Confused-deputy guard: without this, an attacker's own valid `code` plus a
  // state blob claiming a victim's orgId would pass assertPermission below
  // (checked against the victim's real, legitimate session) and bind the
  // attacker's GHL tokens into the victim's org_integrations row.
  if (!safeEqual(state.nonce, cookieNonce) || state.userId !== user.id) {
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
