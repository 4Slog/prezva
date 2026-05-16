import { stripe } from './client'

interface CreateCheckoutParams {
  registrationId:     string
  eventId:            string
  eventTitle:         string
  eventSlug:          string
  ticketTypeId:       string
  ticketName:         string
  priceCents:         number
  currency:           string
  quantity:           number
  attendeeEmail:      string
  attendeeName:       string
  discountAmountCents?: number
  connectedAccountId: string  // Organizer's Stripe account — charge created directly here
  metadata:           Record<string, string>
}

export async function createCheckoutSession(params: CreateCheckoutParams) {
  const finalPrice = Math.max(0, params.priceCents - (params.discountAmountCents ?? 0))
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://prezva.app'

  const session = await stripe.checkout.sessions.create(
    {
      mode:                 'payment',
      payment_method_types: ['card'],
      customer_email:       params.attendeeEmail,
      line_items: [
        {
          price_data: {
            currency:     params.currency,
            unit_amount:  finalPrice,
            product_data: {
              name:        `${params.ticketName} — ${params.eventTitle}`,
              description: 'Event ticket',
            },
          },
          quantity: params.quantity,
        },
      ],
      metadata:    params.metadata,
      success_url: `${appUrl}/e/${params.eventSlug}/confirmation?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${appUrl}/e/${params.eventSlug}/register?cancelled=true`,
      expires_at:  Math.floor(Date.now() / 1000) + 30 * 60,
    },
    {
      idempotencyKey: `checkout-${params.registrationId}`,
      stripeAccount:  params.connectedAccountId,
    },
  )

  return session
}
