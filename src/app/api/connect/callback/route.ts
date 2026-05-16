import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe/client'
import { createAdminClient } from '@/lib/supabase/admin'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://prezva.app'

export async function GET(req: NextRequest) {
  const code  = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const error = req.nextUrl.searchParams.get('error')

  if (error) {
    return NextResponse.redirect(`${APP_URL}/dashboard?connect=denied`)
  }

  if (!code || !state) {
    return NextResponse.redirect(`${APP_URL}/dashboard?connect=error`)
  }

  let orgId: string
  try {
    const parsed = JSON.parse(Buffer.from(state, 'base64url').toString())
    orgId = parsed.orgId
  } catch {
    return NextResponse.redirect(`${APP_URL}/dashboard?connect=error`)
  }

  try {
    const response = await stripe.oauth.token({
      grant_type: 'authorization_code',
      code,
    })

    const stripeAccountId = response.stripe_user_id
    if (!stripeAccountId) throw new Error('No stripe_user_id in OAuth response')

    const account = await stripe.accounts.retrieve(stripeAccountId)

    const admin = createAdminClient()
    await admin
      .from('organizations')
      .update({
        stripe_account_id: stripeAccountId,
        charges_enabled:   account.charges_enabled  ?? false,
        payouts_enabled:   account.payouts_enabled  ?? false,
      })
      .eq('id', orgId)

    const { data: org } = await admin
      .from('organizations')
      .select('slug')
      .eq('id', orgId)
      .maybeSingle()

    return NextResponse.redirect(
      `${APP_URL}/orgs/${org?.slug ?? orgId}/settings?connect=success`
    )
  } catch (err: any) {
    console.error('[connect] OAuth callback failed:', err.message)
    return NextResponse.redirect(
      `${APP_URL}/dashboard?connect=error&msg=${encodeURIComponent(err.message)}`
    )
  }
}
