import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe/client'
import { createAdminClient } from '@/lib/supabase/admin'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://prezva.app'

export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get('org_id')
  if (!orgId) return NextResponse.redirect(`${APP_URL}/dashboard?connect=error`)

  const admin = createAdminClient()
  const { data: org } = await admin
    .from('organizations')
    .select('stripe_account_id')
    .eq('id', orgId)
    .maybeSingle()

  if (org?.stripe_account_id) {
    const account = await stripe.accounts.retrieve(org.stripe_account_id)
    await admin
      .from('organizations')
      .update({
        charges_enabled: account.charges_enabled ?? false,
        payouts_enabled: account.payouts_enabled ?? false,
      })
      .eq('id', orgId)
  }

  return NextResponse.redirect(`${APP_URL}/dashboard?connect=success`)
}
