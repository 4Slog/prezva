import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe/client'

export async function GET() {
  const stripeKey = process.env.STRIPE_SECRET_KEY ?? ''
  const isRestrictedKey = stripeKey.startsWith('rk_live_') || stripeKey.startsWith('rk_test_')
  const clientIdSet = !!process.env.STRIPE_CLIENT_ID

  let platformAccountValid = false
  try {
    const account = await stripe.accounts.retrieve(null)
    platformAccountValid = !!account.id
  } catch {
    platformAccountValid = false
  }

  return NextResponse.json({
    stripe_key_type:            isRestrictedKey ? 'restricted_key_BROKEN' : 'full_key_ok',
    stripe_client_id_set:       clientIdSet,
    platform_account_accessible: platformAccountValid,
    connect_ready:              !isRestrictedKey && clientIdSet && platformAccountValid,
  })
}
