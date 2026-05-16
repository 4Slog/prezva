'use server'

import { stripe } from '@/lib/stripe/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://prezva.app'

// ── Create or retrieve a Connect account for an org ───────────────────────────
export async function getOrCreateConnectAccount(orgId: string) {
  if (!process.env.STRIPE_CLIENT_ID) {
    console.error('[connect] STRIPE_CLIENT_ID not set — cannot create Connect accounts. Add to Vercel env vars.')
    return { error: 'Payment processing is not fully configured. Please contact support.' }
  }

  const user = await requireUser()
  const supabase = await createClient()

  // Must be org owner
  const { data: member } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!member || member.role !== 'owner') {
    return { error: 'Only org owners can connect a bank account' }
  }

  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, email, stripe_account_id')
    .eq('id', orgId)
    .maybeSingle()

  if (!org) return { error: 'Organization not found' }

  // Already has a Connect account
  if (org.stripe_account_id) {
    return { accountId: org.stripe_account_id, existing: true }
  }

  // Create new Express account
  const account = await stripe.accounts.create({
    type: 'express',
    country: 'US',
    email: org.email ?? undefined,
    capabilities: {
      card_payments: { requested: true },
      transfers:     { requested: true },
    },
    business_profile: {
      name: org.name,
      product_description: 'Event ticketing and registration',
      mcc: '7941', // Ticket agencies / theatrical producers
    },
    metadata: {
      org_id:    orgId,
      org_name:  org.name,
      platform:  'prezva',
    },
  })

  // Store the account ID on the org
  await supabase
    .from('organizations')
    .update({ stripe_account_id: account.id })
    .eq('id', orgId)

  return { accountId: account.id, existing: false }
}

// ── Generate onboarding link ──────────────────────────────────────────────────
export async function createOnboardingLink(orgId: string) {
  const result = await getOrCreateConnectAccount(orgId)
  if ('error' in result) return { error: result.error }

  const link = await stripe.accountLinks.create({
    account:     result.accountId,
    refresh_url: `${APP_URL}/api/connect/onboard?org_id=${orgId}&refresh=true`,
    return_url:  `${APP_URL}/api/connect/callback?org_id=${orgId}`,
    type:        'account_onboarding',
  })

  return { url: link.url }
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
