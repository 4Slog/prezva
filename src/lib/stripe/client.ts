import Stripe from 'stripe'

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set')
}

const _stripeKeyCheck = process.env.STRIPE_SECRET_KEY ?? ''
if (_stripeKeyCheck.startsWith('rk_live_') || _stripeKeyCheck.startsWith('rk_test_')) {
  console.error('[stripe] CRITICAL: STRIPE_SECRET_KEY is a restricted key (rk_). Stripe Connect operations will fail. Replace with sk_live_ or sk_test_ in Vercel environment variables.')
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2026-04-22.dahlia',
  typescript: true,
})
