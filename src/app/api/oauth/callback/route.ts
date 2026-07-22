import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { timingSafeEqual } from 'crypto'
import { requireUser } from '@/lib/auth/get-user'
import { assertPermission } from '@/lib/auth/assert-permission'
import { ghlAdapter, REDIRECT_URI, STATE_COOKIE } from '@/lib/integrations/ghl/adapter'

function errorRedirect(origin: string, message: string): NextResponse {
  return NextResponse.redirect(new URL(`/dashboard?error=${encodeURIComponent(message)}`, origin))
}

function pendingInstallPage(): NextResponse {
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Prezva</title></head>
<body style="font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; text-align: center; padding: 24px;">
  <p style="font-size: 16px; color: #1f2937;">Prezva installed — open Prezva from your GoHighLevel sidebar to finish setup.</p>
</body></html>`
  return new NextResponse(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
}

function pendingInstallFailedPage(): NextResponse {
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Prezva</title></head>
<body style="font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; text-align: center; padding: 24px;">
  <p style="font-size: 16px; color: #1f2937;">The install did not complete. Please try installing Prezva again from within the sub-account.</p>
</body></html>`
  return new NextResponse(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const stateB64 = req.nextUrl.searchParams.get('state')

  // Read + clear the nonce cookie unconditionally, before any validation, so a
  // captured callback URL can never be replayed once this request completes.
  const cookieStore = await cookies()
  const cookieNonce = cookieStore.get(STATE_COOKIE)?.value
  cookieStore.delete(STATE_COOKIE)

  // Fully state-less arrival (code present, no state param AND no state
  // cookie): the marketplace-originated cold install. GHL sent the user
  // straight to this REDIRECT_URI without ever routing through
  // /api/oauth/start, so there's no Prezva session and none is required —
  // requireUser() must not run here. Any OTHER combination (state present
  // without a cookie, or vice versa) falls through unchanged to the
  // existing state-ful branch below, which still rejects it as invalid.
  if (code && !stateB64 && !cookieNonce) {
    try {
      const result = await ghlAdapter.handlePendingInstall(code, REDIRECT_URI)
      return result.stored ? pendingInstallPage() : pendingInstallFailedPage()
    } catch (err: unknown) {
      console.error('[ghl-oauth] pending install failed:', err instanceof Error ? err.message : String(err))
      return pendingInstallFailedPage()
    }
  }

  const user = await requireUser()

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
