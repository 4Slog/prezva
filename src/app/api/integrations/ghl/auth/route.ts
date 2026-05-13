import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/get-user'
import { ghlAdapter } from '@/lib/integrations/ghl/adapter'

// GHL blocks "ghl" and "highlevel" in redirect URIs (white-labeling enforcement).
// The registered redirect URI in GHL Marketplace is /api/oauth/callback (no provider name).
const GHL_REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL}/api/oauth/callback`

export async function GET(req: NextRequest) {
  const user = await requireUser()
  const orgId = req.nextUrl.searchParams.get('org_id')
  if (!orgId) return NextResponse.json({ error: 'org_id required' }, { status: 400 })

  if (!ghlAdapter.isConfigured()) {
    return NextResponse.json({ error: 'GoHighLevel credentials not configured' }, { status: 501 })
  }

  const state = Buffer.from(JSON.stringify({ orgId, userId: user.id, provider: 'ghl' })).toString('base64url')
  const authUrl = ghlAdapter.getAuthUrl(orgId, GHL_REDIRECT_URI, state)
  return NextResponse.redirect(authUrl)
}
