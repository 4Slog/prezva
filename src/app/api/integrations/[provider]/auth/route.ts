import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/get-user'
import { getAdapter } from '@/lib/integrations/_shared/registry'

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params
  const user = await requireUser()

  const orgId = req.nextUrl.searchParams.get('org_id')
  if (!orgId) return NextResponse.json({ error: 'org_id required' }, { status: 400 })

  let adapter
  try {
    adapter = getAdapter(provider)
  } catch {
    return NextResponse.json({ error: `Unknown provider: ${provider}` }, { status: 404 })
  }

  if (!adapter.isConfigured()) {
    const returnUrl = req.nextUrl.searchParams.get('return_to') ?? `/orgs/${orgId}/integrations`
    const msg = encodeURIComponent(`${adapter.displayName} is not yet configured. Contact your Prezva admin to add credentials.`)
    return NextResponse.redirect(new URL(`${returnUrl}?error=${msg}`, req.nextUrl.origin))
  }

  const redirectUri = `${req.nextUrl.origin}/api/integrations/${provider}/callback`
  const state = Buffer.from(JSON.stringify({ orgId, userId: user.id })).toString('base64url')
  const authUrl = adapter.getAuthUrl(orgId, redirectUri, state)

  return NextResponse.redirect(authUrl)
}
