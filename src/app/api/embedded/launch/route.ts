import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { mintEmbeddedSession, COOKIE_NAME } from '@/lib/embedded/session'
import { authorizeLaunch } from '@/lib/embedded/auth'
import { isGhlEventsEnabled } from '@/lib/integrations/ghl/config'

// TRUST MODEL (GE-2a.1 — interim gate):
// GHL Custom Menu Link params are NOT cryptographically signed by GHL. An interim
// pre-shared-secret gate (param k, matched against GHL_EMBED_LAUNCH_SECRET via
// SHA-256 + timingSafeEqual) and a single-location gate (location_id must equal
// GHL_LOCATION_ID) are enforced before any session is minted. These two controls
// together prevent anonymous callers and cross-location access for the GE-2a
// placeholder phase. Full GHL-signed SSO verification (Marketplace OAuth JWT) is
// deferred to GE-8 and will replace this gate at that point.

export async function GET(request: NextRequest) {
  if (!isGhlEventsEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('k')
  const location_id = searchParams.get('location_id')
  const user_email = searchParams.get('user_email') ?? undefined
  const location_name = searchParams.get('location_name') ?? undefined

  const auth = authorizeLaunch({ secret, locationId: location_id })
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // location_id is non-null here: authorizeLaunch verified it equals GHL_LOCATION_ID
  const token = await mintEmbeddedSession(location_id!, user_email)

  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'none',
    // SameSite=None requires Secure. In local HTTP dev the cookie will be dropped
    // by the browser — test the flow using HTTPS or a tunneled URL.
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60, // 1 hour, matches token expiry
  })

  const eventsUrl = new URL('/embedded/events', request.url)
  if (location_name) eventsUrl.searchParams.set('location_name', location_name)

  return NextResponse.redirect(eventsUrl)
}
