import { NextRequest, NextResponse } from 'next/server'
import { ghlAdapter } from '@/lib/integrations/ghl/adapter'

// Generic OAuth callback for providers that cannot use /api/integrations/[provider]/callback
// (e.g. GHL blocks "ghl"/"highlevel" in redirect URIs).
// The `provider` field in state routes to the correct adapter.

const REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL}/api/oauth/callback`

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const stateB64 = req.nextUrl.searchParams.get('state')
  const error = req.nextUrl.searchParams.get('error')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin

  if (error) {
    return NextResponse.redirect(`${appUrl}/dashboard?integration_error=${encodeURIComponent(error)}`)
  }

  if (!code || !stateB64) {
    return NextResponse.json({ error: 'Missing code or state' }, { status: 400 })
  }

  let state: { orgId: string; userId: string; provider: string }
  try {
    state = JSON.parse(Buffer.from(stateB64, 'base64url').toString('utf8'))
  } catch {
    return NextResponse.json({ error: 'Invalid state' }, { status: 400 })
  }

  if (state.provider === 'ghl') {
    try {
      await ghlAdapter.handleCallback(code, state.orgId, REDIRECT_URI)
      return NextResponse.redirect(`${appUrl}/dashboard?integration_connected=ghl`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'OAuth failed'
      return NextResponse.redirect(`${appUrl}/dashboard?integration_error=${encodeURIComponent(msg)}`)
    }
  }

  return NextResponse.json({ error: `Unknown provider: ${state.provider}` }, { status: 400 })
}
