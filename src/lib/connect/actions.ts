'use server'

import { stripe } from '@/lib/stripe/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://prezva.app'

// ── Generate Stripe Connect OAuth URL (organizer connects their existing account) ──
export async function getConnectOAuthUrl(orgId: string): Promise<{ url: string } | { error: string }> {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: member } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!member || member.role !== 'owner') {
    return { error: 'Only org owners can connect a Stripe account' }
  }

  if (!process.env.STRIPE_CLIENT_ID) {
    console.error('[connect] STRIPE_CLIENT_ID not set')
    return { error: 'Payment processing is not fully configured. Please contact support.' }
  }

  const state = Buffer.from(JSON.stringify({ orgId, userId: user.id })).toString('base64url')
  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     process.env.STRIPE_CLIENT_ID,
    scope:         'read_write',
    redirect_uri:  `${APP_URL}/api/connect/callback`,
    state,
  })

  return { url: `https://connect.stripe.com/oauth/authorize?${params.toString()}` }
}

// ── Generate login link (to access their Stripe dashboard) ───────────────────
export async function createLoginLink(orgId: string) {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: org } = await supabase
    .from('organizations')
    .select('stripe_account_id')
    .eq('id', orgId)
    .maybeSingle()

  if (!org?.stripe_account_id) {
    return { error: 'No connected Stripe account found' }
  }

  // Verify caller is a member
  const { data: member } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!member) return { error: 'Forbidden' }

  const link = await stripe.accounts.createLoginLink(org.stripe_account_id)
  return { url: link.url }
}

// ── Get Connect account status ────────────────────────────────────────────────
export async function getConnectStatus(orgId: string) {
  const supabase = await createClient()

  const { data: org } = await supabase
    .from('organizations')
    .select('stripe_account_id')
    .eq('id', orgId)
    .maybeSingle()

  if (!org?.stripe_account_id) {
    return { connected: false, status: 'not_connected' as const }
  }

  try {
    const account = await stripe.accounts.retrieve(org.stripe_account_id)

    const chargesEnabled  = account.charges_enabled
    const payoutsEnabled  = account.payouts_enabled
    const detailsSubmitted = account.details_submitted

    let status: 'not_connected' | 'pending' | 'restricted' | 'active'

    if (!detailsSubmitted) {
      status = 'pending'
    } else if (!chargesEnabled || !payoutsEnabled) {
      status = 'restricted'
    } else {
      status = 'active'
    }

    return {
      connected: true,
      status,
      accountId:        account.id,
      chargesEnabled,
      payoutsEnabled,
      detailsSubmitted,
      requirementsCount: account.requirements?.currently_due?.length ?? 0,
    }
  } catch {
    return { connected: false, status: 'not_connected' as const }
  }
}

// ── Disconnect (deauthorize) Connect account ──────────────────────────────────
export async function disconnectConnectAccount(orgId: string) {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: member } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!member || member.role !== 'owner') {
    return { error: 'Only org owners can disconnect a bank account' }
  }

  const { data: org } = await supabase
    .from('organizations')
    .select('stripe_account_id')
    .eq('id', orgId)
    .maybeSingle()

  if (!org?.stripe_account_id) {
    return { ok: true, message: 'No connected account to disconnect' }
  }

  if (process.env.STRIPE_CLIENT_ID) {
    try {
      await stripe.oauth.deauthorize({
        client_id:      process.env.STRIPE_CLIENT_ID,
        stripe_user_id: org.stripe_account_id,
      })
    } catch (err: any) {
      // Already disconnected on Stripe side — still clear our DB
      if (!err?.message?.includes('No such') && !err?.code?.includes('oauth')) {
        return { error: `Stripe deauthorization failed: ${err.message}` }
      }
    }
  } else {
    console.warn('[connect] STRIPE_CLIENT_ID not set — skipping Stripe deauth, clearing DB only')
  }

  const adminClient = createAdminClient()
  await adminClient
    .from('organizations')
    .update({ stripe_account_id: null, charges_enabled: false, payouts_enabled: false })
    .eq('id', orgId)

  return { ok: true }
}
