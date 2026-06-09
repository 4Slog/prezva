import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { mintEmbeddedSession, COOKIE_NAME } from '@/lib/embedded/session'
import { isGhlEventsEnabled } from '@/lib/integrations/ghl/config'

// TRUST MODEL LIMITATION (GE-2a / MVP):
// GHL Custom Menu Link query parameters (location_id, user_email, location_name) are
// injected by GHL's template engine but are NOT cryptographically signed by GHL.
// Any request to this endpoint with a valid location_id can obtain an embedded session.
// MVP trust is enforced by two layers:
//   1. CSP frame-ancestors restricts which origins can embed /embedded/* pages.
//   2. The minted session is bound to a single location_id (PIT context).
// Real cryptographic SSO verification (signed JWTs from GHL's OAuth flow) is deferred
// to GE-8 (Marketplace install + JWT verification). Until then, this endpoint must
// NOT be treated as proof of identity — only as a framing gate.

export async function GET(request: NextRequest) {
  if (!isGhlEventsEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { searchParams } = new URL(request.url)
  const location_id = searchParams.get('location_id')
  const user_email = searchParams.get('user_email') ?? undefined
  const location_name = searchParams.get('location_name') ?? undefined

  if (!location_id) {
    return NextResponse.json({ error: 'location_id is required' }, { status: 400 })
  }

  const token = await mintEmbeddedSession(location_id, user_email)

  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'none',
    // SameSite=None requires Secure. In local HTTP dev the cookie will be dropped
    // by the browser — test the flow using HTTPS or a tunneled URL.
    secure: process.env.NODE_ENV === 'production',
    path: '/embedded',
    maxAge: 60 * 60, // 1 hour, matches token expiry
  })

  const eventsUrl = new URL('/embedded/events', request.url)
  if (location_name) eventsUrl.searchParams.set('location_name', location_name)

  return NextResponse.redirect(eventsUrl)
}
