'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createCheckoutSession } from '@/lib/stripe/checkout'
import { enqueueConfirmationEmail } from '@/lib/trigger'
import { verifyMembership } from '@/lib/integrations/_shared/association-verify'
import { redirect } from 'next/navigation'
import { z } from 'zod'

const RegisterSchema = z.object({
  event_id:       z.string().uuid(),
  ticket_type_id: z.string().uuid(),
  attendee_email: z.string().email(),
  attendee_name:  z.string().min(1).max(120),
  attendee_phone: z.string().optional(),
  attendee_company:   z.string().optional(),
  attendee_job_title: z.string().optional(),
  discount_code:      z.string().optional(),
})

// ── Validate discount code ────────────────────────────────────────────────────
export async function validateDiscountCode(eventId: string, code: string) {
  const supabase = await createClient()
  const now = new Date().toISOString()

  const { data } = await supabase
    .from('discount_codes')
    .select('*')
    .eq('event_id', eventId)
    .eq('code', code.toUpperCase().trim())
    .eq('is_active', true)
    .maybeSingle()

  if (!data) return { valid: false, error: 'Invalid discount code' }
  if (data.valid_from && data.valid_from > now) return { valid: false, error: 'Discount code not yet active' }
  if (data.valid_until && data.valid_until < now) return { valid: false, error: 'Discount code has expired' }
  if (data.max_uses !== null && data.uses_count >= data.max_uses) {
    return { valid: false, error: 'Discount code has reached its usage limit' }
  }

  return {
    valid: true,
    discountCode: data,
    discountAmountCents: (priceCents: number) => {
      if (data.discount_type === 'percent') {
        return Math.round(priceCents * data.discount_value / 100)
      }
      return Math.min(priceCents, data.discount_value)
    },
  }
}

// ── Start registration (free ticket → confirm directly, paid → Stripe) ────────
export async function startRegistration(formData: FormData) {
  const supabase = await createClient()

  // Get current user if logged in (optional — guests can register)
  const { data: { user } } = await supabase.auth.getUser()

  const raw = {
    event_id:           formData.get('event_id'),
    ticket_type_id:     formData.get('ticket_type_id'),
    attendee_email:     formData.get('attendee_email'),
    attendee_name:      formData.get('attendee_name'),
    attendee_phone:     formData.get('attendee_phone') || undefined,
    attendee_company:   formData.get('attendee_company') || undefined,
    attendee_job_title: formData.get('attendee_job_title') || undefined,
    discount_code:      formData.get('discount_code') || undefined,
  }

  const parsed = RegisterSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  // Load event + ticket
  const { data: event } = await supabase
    .from('events')
    .select('id, title, slug, status, capacity, registration_count, timezone, start_at, venue_name, venue_city, venue_state, org_id, organizations(name, stripe_account_id)')
    .eq('id', parsed.data.event_id)
    .maybeSingle()

  if (!event) return { error: 'Event not found' }
  if (!['published', 'live'].includes(event.status)) {
    return { error: 'Registration is not open for this event' }
  }

  const { data: ticket } = await supabase
    .from('ticket_types')
    .select('*')
    .eq('id', parsed.data.ticket_type_id)
    .eq('event_id', parsed.data.event_id)
    .eq('is_active', true)
    .maybeSingle()

  if (!ticket) return { error: 'Ticket type not found or unavailable' }

  const now = new Date().toISOString()
  if (ticket.sale_starts_at && ticket.sale_starts_at > now) {
    return { error: 'Ticket sales have not started yet' }
  }
  if (ticket.sale_ends_at && ticket.sale_ends_at < now) {
    return { error: 'Ticket sales have ended' }
  }

  // Capacity check — enforce at DB level via trigger, but also check here
  if (event.capacity !== null) {
    if (event.registration_count >= event.capacity) {
      if (!ticket.quantity || ticket.quantity_sold < ticket.quantity) {
        // Event full — check waitlist
        return await addToWaitlist(supabase, parsed.data, event, ticket, user?.id)
      }
    }
  }

  // Ticket quantity check
  if (ticket.quantity !== null && ticket.quantity_sold >= ticket.quantity) {
    return { error: 'This ticket type is sold out' }
  }

  // Member-only ticket gating
  if ((ticket as any).membership_required) {
    const { verified } = await verifyMembership((event as any).org_id, parsed.data.attendee_email)
    if (!verified) {
      return { error: 'This ticket requires an active membership. Please verify your membership status or contact the organizer.' }
    }
  }

  // Discount code
  let discountCodeId: string | undefined
  let discountAmountCents = 0

  if (parsed.data.discount_code) {
    const result = await validateDiscountCode(parsed.data.event_id, parsed.data.discount_code)
    if (!result.valid) return { error: result.error }
    discountCodeId = result.discountCode!.id
    discountAmountCents = result.discountAmountCents!(ticket.price_cents)
  }

  // Free ticket → confirm immediately
  if (ticket.type === 'free' || ticket.price_cents === 0) {
    return await confirmFreeRegistration(
      supabase,
      parsed.data,
      event,
      ticket,
      user?.id,
      discountCodeId,
    )
  }

  // Paid ticket → Stripe Checkout
  // Require connected account for paid tickets
  const org = event.organizations as unknown as { name: string; stripe_account_id: string | null } | null
  if (!org?.stripe_account_id) {
    return { error: 'This organization has not connected a bank account yet. Contact the event organizer.' }
  }

  // Verify the organizer's Stripe Connect account can accept payments
  const { stripe } = await import('@/lib/stripe/client')
  const account = await stripe.accounts.retrieve(org.stripe_account_id)
  if (!account.charges_enabled || !account.details_submitted) {
    return { error: 'This event is not currently accepting payments. Please contact the organizer.' }
  }

  return await createPaidRegistration(
    supabase,
    parsed.data,
    event,
    ticket,
    user?.id,
    discountCodeId,
    discountAmountCents,
    org.stripe_account_id,
  )
}

// ── Free registration ─────────────────────────────────────────────────────────
async function confirmFreeRegistration(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>,
  data: z.infer<typeof RegisterSchema>,
  event: Record<string, unknown>,
  ticket: Record<string, unknown>,
  userId: string | undefined,
  discountCodeId: string | undefined,
) {
  // Use admin client for the insert so anonymous/guest registrations bypass RLS.
  // (Sprint 19) Server action above has already validated event status, ticket
  // availability, capacity, sale windows, discount codes and membership gates,
  // so an unauthenticated write here is safe.
  const admin = createAdminClient()
  const { data: reg, error } = await admin
    .from('registrations')
    .insert({
      event_id:       data.event_id,
      ticket_type_id: data.ticket_type_id,
      user_id:        userId ?? null,
      attendee_email: data.attendee_email,
      attendee_name:  data.attendee_name,
      attendee_phone: data.attendee_phone ?? null,
      attendee_company:   data.attendee_company ?? null,
      attendee_job_title: data.attendee_job_title ?? null,
      status:              'confirmed',
      amount_paid_cents:   0,
      discount_code_id:    discountCodeId ?? null,
      confirmation_sent_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) return { error: error.message }
  void supabase

  // Enqueue confirmation email (non-blocking)
  const org = event.organizations as { name: string } | null
  await enqueueConfirmationEmail({
    registrationId: reg.id,
    attendeeEmail:  data.attendee_email,
    attendeeName:   data.attendee_name,
    eventTitle:     event.title as string,
    eventStartAt:   event.start_at as string,
    eventSlug:      event.slug as string,
    eventVenue:     [event.venue_name, event.venue_city, event.venue_state]
      .filter(Boolean).join(', ') || undefined,
    qrCode:  reg.qr_code,
    orgName: org?.name ?? 'Prezva',
  })

  redirect(`/e/${event.slug as string}/confirmation?reg=${reg.id}`)
}

// ── Paid registration → Stripe Checkout ──────────────────────────────────────
async function createPaidRegistration(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>,
  data: z.infer<typeof RegisterSchema>,
  event: Record<string, unknown>,
  ticket: Record<string, unknown>,
  userId: string | undefined,
  discountCodeId: string | undefined,
  discountAmountCents: number,
  connectedAccountId: string,
) {
  // Create pending registration first (admin client bypasses RLS for guests)
  const admin = createAdminClient()
  const { data: reg, error } = await admin
    .from('registrations')
    .insert({
      event_id:       data.event_id,
      ticket_type_id: data.ticket_type_id,
      user_id:        userId ?? null,
      attendee_email: data.attendee_email,
      attendee_name:  data.attendee_name,
      attendee_phone: data.attendee_phone ?? null,
      attendee_company:   data.attendee_company ?? null,
      attendee_job_title: data.attendee_job_title ?? null,
      status:              'pending',
      amount_paid_cents:   (ticket.price_cents as number) - discountAmountCents,
      discount_code_id:    discountCodeId ?? null,
      discount_amount_cents: discountAmountCents,
    })
    .select()
    .single()

  if (error) return { error: error.message }
  void supabase

  // Create Stripe Checkout session
  try {
    const org = event.organizations as { name: string } | null
    const session = await createCheckoutSession({
      registrationId:     reg.id,
      eventId:            data.event_id,
      eventTitle:         event.title as string,
      eventSlug:          event.slug as string,
      ticketTypeId:       data.ticket_type_id,
      ticketName:         ticket.name as string,
      priceCents:         ticket.price_cents as number,
      currency:           ticket.currency as string,
      quantity:           1,
      attendeeEmail:      data.attendee_email,
      attendeeName:       data.attendee_name,
      discountAmountCents,
      connectedAccountId,
      metadata: {
        registration_id:  reg.id,
        event_id:         data.event_id,
        ticket_type_id:   data.ticket_type_id,
        attendee_email:   data.attendee_email,
        attendee_name:    data.attendee_name,
        org_name:         org?.name ?? '',
      },
    })

    // Store session ID on the registration
    await admin
      .from('registrations')
      .update({
        stripe_payment_intent_id: session.payment_intent as string ?? session.id,
        stripe_session_id:        session.id,
      })
      .eq('id', reg.id)

    redirect(session.url!)
  } catch {
    // Clean up pending registration if Stripe fails
    await admin.from('registrations').delete().eq('id', reg.id)
    return { error: 'Payment setup failed — please try again' }
  }
}

// ── Waitlist ──────────────────────────────────────────────────────────────────
async function addToWaitlist(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>,
  data: z.infer<typeof RegisterSchema>,
  event: Record<string, unknown>,
  ticket: Record<string, unknown>,
  userId: string | undefined,
) {
  // Get current waitlist count for position (admin client — guest-friendly)
  const admin = createAdminClient()
  const { count } = await admin
    .from('registrations')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', data.event_id)
    .eq('status', 'waitlisted')

  const position = (count ?? 0) + 1

  const { data: reg, error } = await admin
    .from('registrations')
    .insert({
      event_id:        data.event_id,
      ticket_type_id:  data.ticket_type_id,
      user_id:         userId ?? null,
      attendee_email:  data.attendee_email,
      attendee_name:   data.attendee_name,
      attendee_phone:  data.attendee_phone ?? null,
      status:          'waitlisted',
      amount_paid_cents: 0,
      waitlist_position: position,
    })
    .select()
    .single()

  if (error) return { error: error.message }
  void supabase
  redirect(`/e/${event.slug as string}/confirmation?reg=${reg.id}&waitlist=true`)
}
