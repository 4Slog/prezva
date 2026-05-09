import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe/client'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://prezva.app'

// GET /api/connect/callback?org_id=xxx
// Stripe return_url after onboarding — verify status and redirect to settings
export async function GET(req: NextRequest) {
  const orgId = req.nextUrl.searchParams.get('org_id')
  if (!orgId) return NextResponse.redirect(`${APP_URL}/dashboard`)

  // Fetch the org to get the account ID
  const supabase = await createClient()
  const { data: org } = await supabase
    .from('organizations')
    .select('stripe_account_id, slug')
    .eq('id', orgId)
    .maybeSingle()

  if (!org?.stripe_account_id) {
    return NextResponse.redirect(`${APP_URL}/orgs/${org?.slug}/settings?connect=error`)
  }

  // Check if onboarding is complete
  const account = await stripe.accounts.retrieve(org.stripe_account_id)

  if (account.details_submitted) {
    return NextResponse.redirect(
      `${APP_URL}/orgs/${org.slug}/settings?connect=success`
    )
  }

  // Onboarding incomplete — send them back
  return NextResponse.redirect(
    `${APP_URL}/orgs/${org.slug}/settings?connect=incomplete`
  )
}
