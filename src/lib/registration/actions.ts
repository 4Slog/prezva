'use server'

import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createCheckoutSession } from '@/lib/stripe/checkout'
import { enqueueConfirmationEmail } from '@/lib/trigger'
import { verifyMembership } from '@/lib/integrations/_shared/association-verify'
import { checkRateLimit, registrationLimiter } from '@/lib/ratelimit'
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
  delivery_method:    z.enum(['in_person', 'virtual']).optional(),
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
  const ip = (await headers()).get('x-forwarded-for') ?? 'unknown'
  const { limited } = await checkRateLimit(registrationLimiter, ip)
  if (limited) return { error: 'Too many requests — please try again in a minute.' }

  const supabase = await createClient()

  // Get current user if logged in (optional — guests can register)
  const { data: { user } } = await supabase.auth.getUser()

  const quantity = Math.max(1, Math.min(10, parseInt(formData.get('quantity') as string || '1', 10) || 1))

  const raw = {
    event_id:           formData.get('event_id'),
    ticket_type_id:     formData.get('ticket_type_id'),
    attendee_email:     formData.get('attendee_email'),
    // Support split first/last fields — combine into attendee_name
    // Falls back to attendee_name for backwards compatibility
    attendee_name: (() => {
      const first = (formData.get('attendee_first_name') as string || '').trim()
      const last = (formData.get('attendee_last_name') as string || '').trim()
      if (first || last) return `${first} ${last}`.trim()
      return formData.get('attendee_name')
    })(),
    attendee_phone:     formData.get('attendee_phone') || undefined,
    attendee_company:   formData.get('attendee_company') || undefined,
    attendee_job_title: formData.get('attendee_job_title') || undefined,
    discount_code:      formData.get('discount_code') || undefined,
    delivery_method:    formData.get('delivery_method') || undefined,
  }

  const parsed = RegisterSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  // Collect custom field responses (cf_<uuid> keys → { fieldId, value })
  const fieldResponseMap = new Map<string, string[]>()
  for (const [key, value] of formData.entries()) {
    if (key.startsWith('cf_') && typeof value === 'string' && value.trim()) {
      const fieldId = key.slice(3)
      const existing = fieldResponseMap.get(fieldId) ?? []
      existing.push(value)
      fieldResponseMap.set(fieldId, existing)
    }
  }
  const fieldResponses = Array.from(fieldResponseMap.entries()).map(([fieldId, values]) => ({
    fieldId,
    value: values.join(', '),
  }))

  // Load event + ticket
  const { data: event } = await supabase
    .from('events')
    .select('id, title, slug, status, capacity, registration_count, timezone, start_at, venue_name, venue_city, venue_state, org_id, require_approval, event_type, virtual_url, registration_invite_code, registration_domain_restrict, organizations(name, email, stripe_account_id)')
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
  // Per-event invite code check
  const inviteCode = (parsed.data as any).invite_code as string | undefined
  if ((event as any).registration_invite_code) {
    if (!inviteCode || inviteCode.trim().toUpperCase() !== (event as any).registration_invite_code.trim().toUpperCase()) {
      return { error: 'An invite code is required to register for this event.' }
    }
  }

  // Domain restriction check
  if ((event as any).registration_domain_restrict) {
    const allowedDomain = (event as any).registration_domain_restrict.trim().toLowerCase()
    const emailDomain = (parsed.data as any).attendee_email?.split('@')[1]?.toLowerCase()
    if (emailDomain !== allowedDomain) {
      return { error: `Registration is restricted to ${allowedDomain} email addresses.` }
    }
  }

  // Duplicate registration check
  const { data: existingReg } = await supabase
    .from('registrations')
    .select('id, status')
    .eq('event_id', parsed.data.event_id)
    .eq('attendee_email', parsed.data.attendee_email.toLowerCase())
    .in('status', ['confirmed', 'pending', 'checked_in'])
    .maybeSingle()
  if (existingReg) {
    return { error: 'You are already registered for this event. Check your email for your confirmation.' }
  }

  if (event.capacity !== null) {
    if (event.registration_count >= event.capacity) {
      if (!ticket.quantity || ticket.quantity_sold < ticket.quantity) {
        // Event full — check waitlist
        return await addToWaitlist(supabase, parsed.data, event, ticket, user?.id)
      }
    }
  }

  // Ticket quantity check — account for full batch requested
  if (ticket.quantity !== null) {
    if (ticket.quantity_sold >= ticket.quantity) {
      return { error: 'This ticket type is sold out' }
    }
    if (ticket.quantity_sold + quantity > ticket.quantity) {
      const remaining = ticket.quantity - ticket.quantity_sold
      return { error: `Only ${remaining} spot${remaining !== 1 ? 's' : ''} remaining` }
    }
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

  // Compute effective delivery_method
  const ticketDelivery = (ticket as any).delivery_method as string ?? 'in_person'
  const effectiveDelivery: 'in_person' | 'virtual' = ticketDelivery === 'both'
    ? (parsed.data.delivery_method ?? 'in_person')
    : (ticketDelivery as 'in_person' | 'virtual')
  const registrationData = { ...parsed.data, delivery_method: effectiveDelivery }

  // Free ticket → confirm immediately
  if (ticket.type === 'free' || ticket.price_cents === 0) {
    return await confirmFreeRegistration(
      supabase,
      registrationData,
      event,
      ticket,
      user?.id,
      discountCodeId,
      fieldResponses,
      quantity,
    )
  }

  // Paid ticket → Stripe Checkout
  // Require connected account for paid tickets
  const org = event.organizations as unknown as { name: string; email?: string | null; stripe_account_id: string | null } | null
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
    registrationData,
    event,
    ticket,
    user?.id,
    discountCodeId,
    discountAmountCents,
    org.stripe_account_id,
    fieldResponses,
    quantity,
  )
}

// ── Free registration ─────────────────────────────────────────────────────────
async function saveFieldResponses(admin: ReturnType<typeof createAdminClient>, registrationId: string, responses: { fieldId: string; value: string }[]) {
  if (responses.length === 0) return
  await admin.from('registration_field_responses').insert(
    responses.map(r => ({ registration_id: registrationId, field_id: r.fieldId, value: r.value }))
  )
}

async function confirmFreeRegistration(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>,
  data: z.infer<typeof RegisterSchema>,
  event: Record<string, unknown>,
  ticket: Record<string, unknown>,
  userId: string | undefined,
  discountCodeId: string | undefined,
  fieldResponses: { fieldId: string; value: string }[],
  quantity = 1,
) {
  // Use admin client for the insert so anonymous/guest registrations bypass RLS.
  const admin = createAdminClient()
  const requireApproval = (event as any).require_approval === true
  const now = new Date().toISOString()

  // Insert all registrations for the requested quantity
  const insertRows = Array.from({ length: quantity }, () => ({
    event_id:       data.event_id,
    ticket_type_id: data.ticket_type_id,
    user_id:        userId ?? null,
    attendee_email: data.attendee_email,
    attendee_name:  data.attendee_name,
    attendee_phone: data.attendee_phone ?? null,
    attendee_company:   data.attendee_company ?? null,
    attendee_job_title: data.attendee_job_title ?? null,
    status:              requireApproval ? 'pending' : 'confirmed',
    amount_paid_cents:   0,
    discount_code_id:    discountCodeId ?? null,
    confirmation_sent_at: requireApproval ? null : now,
    delivery_method: data.delivery_method ?? 'in_person',
  }))

  const { data: regs, error } = await admin
    .from('registrations')
    .insert(insertRows)
    .select()

  if (error) return { error: error.message }
  if (!regs || regs.length === 0) return { error: 'Registration failed' }

  const reg = regs[0]
  void supabase

  const org = event.organizations as { name: string; email?: string | null } | null
  const orgName = org?.name ?? 'Prezva'
  const orgEmail = org?.email || undefined

  if (requireApproval) {
    // Send "application received" email instead of confirmation
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://prezva.app'
    const regIdB64 = Buffer.from(reg.id).toString('base64url')
    const unsubUrl = `${appUrl}/api/unsubscribe?token=${regIdB64}&type=all`
    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#0D1B2A;padding:24px 32px;border-radius:12px 12px 0 0;">
          <div style="background:#00BFA6;width:32px;height:32px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;">
            <span style="color:#0D1B2A;font-weight:900;font-size:18px;">P</span>
          </div>
          <h1 style="color:#F0F4F8;font-size:22px;margin:0;">Application received!</h1>
        </div>
        <div style="background:#0F2236;padding:24px 32px;border-radius:0 0 12px 12px;color:#CBD5E1;">
          <p style="font-size:15px;">Hi ${data.attendee_name},</p>
          <p style="font-size:15px;">Your registration for <strong style="color:#F0F4F8;">${event.title as string}</strong> is pending approval. You'll hear from us once the organizer reviews your application.</p>
          <hr style="border:none;border-top:1px solid #1E3A5F;margin:20px 0;" />
          <p style="color:#475569;font-size:12px;margin:0;">Sent by ${orgName} via <a href="https://prezva.app" style="color:#00BFA6;text-decoration:none;">Prezva</a>.</p>
          <p style="font-size:11px;color:#475569;text-align:center;margin-top:16px;"><a href="${unsubUrl}" style="color:#64748B;">Unsubscribe from all emails</a></p>
        </div>
      </div>
    `
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `${orgName} <noreply@prezva.app>`, reply_to: orgEmail, to: data.attendee_email, subject: `${orgName}: Application received for ${event.title as string}`, html }),
    })
    await saveFieldResponses(admin, reg.id, fieldResponses)
    redirect(`/e/${event.slug as string}/confirmation?reg=${reg.id}&pending=1`)
  }

  await saveFieldResponses(admin, reg.id, fieldResponses)
  // Enqueue confirmation email for primary registration (non-blocking)
  await enqueueConfirmationEmail({
    registrationId: reg.id,
    attendeeEmail:  data.attendee_email,
    attendeeName:   data.attendee_name,
    eventTitle:     event.title as string,
    eventStartAt:   event.start_at as string,
    eventSlug:      event.slug as string,
    eventVenue:     [event.venue_name, event.venue_city, event.venue_state]
      .filter(Boolean).join(', ') || undefined,
    qrCode:    reg.qr_code,
    orgName,
    orgEmail,
    virtualUrl: (event as any).virtual_url ?? undefined,
    eventType:  (event as any).event_type ?? undefined,
  })

  if (regs.length > 1) {
    const allIds = regs.map((r: any) => r.id).join(',')
    redirect(`/e/${event.slug as string}/confirmation?reg=${reg.id}&batch=${allIds}`)
  }
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
  fieldResponses: { fieldId: string; value: string }[],
  quantity = 1,
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
      delivery_method: data.delivery_method ?? 'in_person',
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
      quantity,
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

    await saveFieldResponses(admin, reg.id, fieldResponses)
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
