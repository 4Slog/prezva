'use server'

import { stripe } from '@/lib/stripe/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://prezva.app'

// ── Start Connect Onboarding (creates Express account, returns account link) ──
export async function startConnectOnboarding(orgId: string): Promise<{ url: string } | { error: string }> {
  const user = await requireUser()
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: member } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!member || member.role !== 'owner') {
    return { error: 'Only org owners can connect a Stripe account' }
  }

  const { data: org } = await supabase
    .from('organizations')
    .select('stripe_account_id, name')
    .eq('id', orgId)
    .maybeSingle()

  let accountId = org?.stripe_account_id

  if (!accountId) {
    const account = await stripe.accounts.create({
      type: 'express',
      capabilities: {
        card_payments: { requested: true },
        transfers:     { requested: true },
      },
      metadata: { org_id: orgId, platform: 'prezva' },
    })
    accountId = account.id
    await admin
      .from('organizations')
      .update({ stripe_account_id: accountId })
      .eq('id', orgId)
  }

  const accountLink = await stripe.accountLinks.create({
    account:     accountId,
    refresh_url: `${APP_URL}/api/connect/onboard?org_id=${orgId}`,
    return_url:  `${APP_URL}/orgs/${orgId}/settings?connect=success`,
    type:        'account_onboarding',
  })

  return { url: accountLink.url }
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

  // Do NOT delete the Stripe account and do NOT clear stripe_account_id.
  // - Deleting destroys the organizer's payout history permanently.
  // - Clearing the ID means reconnect creates a new Express account,
  //   forcing them through full onboarding again from scratch.
  // Instead: just clear the capability flags so the UI shows disconnected.
  // On reconnect, startConnectOnboarding finds the existing account ID
  // and generates a new account link for the same account — no new account,
  // no fresh onboarding.

  const adminClient = createAdminClient()
  await adminClient
    .from('organizations')
    .update({ charges_enabled: false, payouts_enabled: false })
    .eq('id', orgId)

  return { ok: true }
}
