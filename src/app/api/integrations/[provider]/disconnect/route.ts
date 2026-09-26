import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/get-user'
import { assertPermission } from '@/lib/auth/assert-permission'
import { isSafeRelativePath } from '@/lib/auth/resolve-next'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAdapter } from '@/lib/integrations/_shared/registry'
import {
  GHL_DISCONNECT_REFUSAL,
  INTEGRATIONS_PERMISSION,
  NOT_FOUND_OR_FORBIDDEN,
} from '@/lib/integrations/_shared/connectable'

// O151 / F-R13. Disconnecting needs org.integrations on the org, the
// integration row must belong to that org, the adapter acts on the row's org
// id, and the response always stays on this origin.

function redirectTo(req: Request, rawReturnTo: unknown, error?: string) {
  const origin = new URL(req.url).origin
  const path = typeof rawReturnTo === 'string' && isSafeRelativePath(rawReturnTo) ? rawReturnTo : '/dashboard'
  let url = new URL(path, origin)
  // Belt and braces: whatever the path parsed to, it must stay on this origin.
  if (url.origin !== origin) url = new URL('/dashboard', origin)
  if (error) url.searchParams.set('error', error)
  // 303: the browser follows a POST form submission with a GET.
  return NextResponse.redirect(url, 303)
}

export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const user = await requireUser()
  const { provider } = await params
  const formData = await req.formData()
  const orgId = formData.get('orgId')
  const returnTo = formData.get('returnTo')
  const fail = (message: string) => redirectTo(req, returnTo, message)

  // Deleting the GHL row would strand the installed app: webhooks and the
  // embedded view lose their token while GHL still shows Prezva installed.
  if (provider === 'ghl') return fail(GHL_DISCONNECT_REFUSAL)

  if (typeof orgId !== 'string' || !orgId) return fail(NOT_FOUND_OR_FORBIDDEN)

  // Permission first, on the org named in the form: an unauthorized caller gets
  // the uniform refusal before any service-role read, so nothing about another
  // org's integrations (existence, lookup errors) is observable.
  try {
    await assertPermission(orgId, user.id, INTEGRATIONS_PERMISSION)
  } catch {
    return fail(NOT_FOUND_OR_FORBIDDEN)
  }

  // Admin client: the integration row must exist for that org, and the adapter
  // acts on the row's org id, not the raw form value.
  const { data: row, error: rowErr } = await createAdminClient()
    .from('org_integrations')
    .select('org_id, provider')
    .eq('org_id', orgId)
    .eq('provider', provider)
    .maybeSingle()
  if (rowErr) {
    console.error('[integrations] disconnect lookup failed', { provider, error: rowErr.message })
    return fail('Could not disconnect the integration. Please try again.')
  }
  if (!row) return fail(NOT_FOUND_OR_FORBIDDEN)

  let adapter
  try {
    adapter = getAdapter(provider)
  } catch {
    return fail('Unknown integration.')
  }

  try {
    await adapter.disconnect(row.org_id)
  } catch (e) {
    console.error('[integrations] disconnect failed', { provider, orgId: row.org_id, error: e instanceof Error ? e.message : String(e) })
    return fail(`Could not disconnect ${adapter.displayName}. Please try again.`)
  }

  return redirectTo(req, returnTo)
}
