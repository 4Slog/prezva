import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/get-user'
import { assertPermission } from '@/lib/auth/assert-permission'
import { getAdapter } from '@/lib/integrations/_shared/registry'
import { verifyOAuthState } from '@/lib/integrations/_shared/oauth-state'
import { INTEGRATIONS_PERMISSION, NOT_CONNECTABLE_MESSAGE, isConnectableProvider, providerErrorMessage } from '@/lib/integrations/_shared/connectable'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params
  // Before the state is verified there is no trusted org to return to.
  const fail = (message: string, path = '/dashboard') => {
    const url = new URL(path, req.nextUrl.origin)
    url.searchParams.set('error', message)
    return NextResponse.redirect(url)
  }
  const orgPage = async (orgId: string) => {
    const { data: org } = await createAdminClient().from('organizations').select('slug').eq('id', orgId).maybeSingle()
    return `/orgs/${org?.slug ?? orgId}/integrations`
  }

  if (!isConnectableProvider(provider)) return fail(NOT_CONNECTABLE_MESSAGE)

  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const error = req.nextUrl.searchParams.get('error')
  if (error) return fail(providerErrorMessage(error))
  if (!code || !state) return NextResponse.json({ error: 'Missing code or state' }, { status: 400 })

  // The state must be one we signed, unexpired, for this provider, for the
  // user who is signed in now — so a forged or replayed-by-someone-else state
  // can never bind a provider account to an org.
  const user = await requireUser()
  const verified = verifyOAuthState(state, { provider, userId: user.id })
  if (!verified.ok) return fail('This connection link is invalid or has expired. Please try connecting again.')
  const orgId = verified.orgId

  try {
    await assertPermission(orgId, user.id, INTEGRATIONS_PERMISSION)
  } catch {
    return fail('You do not have permission to connect integrations for this organization.')
  }
  const returnPath = await orgPage(orgId)

  let adapter
  try {
    adapter = getAdapter(provider)
  } catch {
    return NextResponse.json({ error: `Unknown provider: ${provider}` }, { status: 404 })
  }

  const redirectUri = `${req.nextUrl.origin}/api/integrations/${provider}/callback`
  try {
    await adapter.handleCallback(code, orgId, redirectUri)
  } catch (err) {
    console.error(`[integrations] ${provider} callback failed`, err instanceof Error ? err.message : String(err))
    return fail(`Could not connect ${adapter.displayName}. Please try again.`, returnPath)
  }

  return NextResponse.redirect(`${req.nextUrl.origin}${returnPath}?connected=${provider}`)
}
