import { NextRequest, NextResponse } from 'next/server'
import { getAdapter } from '@/lib/integrations/_shared/registry'

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params
  const code = req.nextUrl.searchParams.get('code')
  const stateB64 = req.nextUrl.searchParams.get('state')
  const error = req.nextUrl.searchParams.get('error')

  if (error) {
    return NextResponse.redirect(`${req.nextUrl.origin}/dashboard?integration_error=${encodeURIComponent(error)}`)
  }

  if (!code || !stateB64) {
    return NextResponse.json({ error: 'Missing code or state' }, { status: 400 })
  }

  let state: { orgId: string; userId: string }
  try {
    state = JSON.parse(Buffer.from(stateB64, 'base64url').toString('utf8'))
  } catch {
    return NextResponse.json({ error: 'Invalid state' }, { status: 400 })
  }

  let adapter
  try {
    adapter = getAdapter(provider)
  } catch {
    return NextResponse.json({ error: `Unknown provider: ${provider}` }, { status: 404 })
  }

  const redirectUri = `${req.nextUrl.origin}/api/integrations/${provider}/callback`

  try {
    await adapter.handleCallback(code, state.orgId, redirectUri)
  } catch (err: any) {
    return NextResponse.redirect(`${req.nextUrl.origin}/dashboard?integration_error=${encodeURIComponent(err.message)}`)
  }

  const { createAdminClient } = await import('@/lib/supabase/admin')
  const admin = createAdminClient()
  const { data: org } = await admin
    .from('organizations')
    .select('slug')
    .eq('id', state.orgId)
    .maybeSingle()

  const orgSlug = org?.slug ?? state.orgId
  return NextResponse.redirect(`${req.nextUrl.origin}/orgs/${orgSlug}/integrations?connected=${provider}`)
}
