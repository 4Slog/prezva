import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { mintEmbeddedSession, COOKIE_NAME } from '@/lib/embedded/session'
import { decryptSsoPayload, SsoConfigError } from '@/lib/embedded/sso'
import { isGhlEventsEnabled } from '@/lib/integrations/ghl/config'

// GHL Custom Page SSO doorway (GE-8 batch 4). Built ALONGSIDE the interim
// ?k= gate in /api/embedded/launch (authorizeLaunch) — that route is
// untouched. This path is multi-tenant by design: it does NOT check
// GHL_LOCATION_ID. Tenant scoping happens downstream in /embedded/events via
// ghl_location_links, same as the ?k= path.

export async function POST(request: NextRequest) {
  if (!isGhlEventsEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  let encryptedData: unknown
  try {
    const body = await request.json()
    encryptedData = body?.encryptedData
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (typeof encryptedData !== 'string' || !encryptedData) {
    return NextResponse.json({ error: 'Missing encryptedData' }, { status: 400 })
  }

  let context
  try {
    context = decryptSsoPayload(encryptedData)
  } catch (err) {
    if (err instanceof SsoConfigError) {
      console.error('[embedded-sso] configuration error:', err.message)
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }
    // Never log decrypted payload contents (PII) — decrypt failed here, so there's
    // nothing to log beyond the fact that it failed.
    console.error('[embedded-sso] SSO payload rejected')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('[embedded-sso] decrypted payload keys:', Object.keys(context))

  const token = await mintEmbeddedSession(context.locationId, context.email)

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

  return NextResponse.json({ ok: true, next: '/embedded/events' })
}
