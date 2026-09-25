import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/get-user'
import { assertPermission } from '@/lib/auth/assert-permission'
import { getAdapter } from '@/lib/integrations/_shared/registry'
import { isSafeRelativePath } from '@/lib/auth/resolve-next'
import { signOAuthState } from '@/lib/integrations/_shared/oauth-state'
import { INTEGRATIONS_PERMISSION, NOT_CONNECTABLE_MESSAGE, isConnectableProvider } from '@/lib/integrations/_shared/connectable'

// Same-origin paths only, so return_to cannot bounce the user off-site.
function safeReturnPath(raw: string | null, fallback: string): string {
  return raw && isSafeRelativePath(raw) ? raw : fallback
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params
  const user = await requireUser()

  const orgId = req.nextUrl.searchParams.get('org_id')
  if (!orgId) return NextResponse.json({ error: 'org_id required' }, { status: 400 })
  const returnUrl = safeReturnPath(req.nextUrl.searchParams.get('return_to'), '/dashboard')
  const fail = (message: string) => {
    let url = new URL(returnUrl, req.nextUrl.origin)
    // Belt and braces: whatever the path parsed to, it must stay on this origin.
    if (url.origin !== req.nextUrl.origin) url = new URL('/dashboard', req.nextUrl.origin)
    url.searchParams.set('error', message)
    return NextResponse.redirect(url)
  }

  // E-R5: only GHL (its own flow) and Google Drive can be connected.
  if (!isConnectableProvider(provider)) return fail(NOT_CONNECTABLE_MESSAGE)

  try {
    await assertPermission(orgId, user.id, INTEGRATIONS_PERMISSION)
  } catch {
    return fail('You do not have permission to connect integrations for this organization.')
  }

  let adapter
  try {
    adapter = getAdapter(provider)
  } catch {
    return NextResponse.json({ error: `Unknown provider: ${provider}` }, { status: 404 })
  }

  if (!adapter.isConfigured()) {
    return fail(`${adapter.displayName} is not yet configured. Contact your Prezva admin to add credentials.`)
  }

  let state: string
  try {
    state = signOAuthState({ provider, orgId, userId: user.id })
  } catch {
    return fail('Integrations are temporarily unavailable. Please try again later.')
  }

  const redirectUri = `${req.nextUrl.origin}/api/integrations/${provider}/callback`
  return NextResponse.redirect(adapter.getAuthUrl(orgId, redirectUri, state))
}
