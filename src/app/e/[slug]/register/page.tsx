import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { readEventInviteCode } from '@/lib/events/invite-code'
import { getFormFields } from '@/lib/events/form-field-actions'
import { RegisterPageClient } from './client'

type Props = { params: Promise<{ slug: string }> }

export default async function RegisterPage({ params }: Props) {
  const { slug } = await params
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: event } = await supabase
    .from('events')
    .select('id, title, slug, status, start_at, end_at, timezone, venue_name, venue_city, venue_state, org_id')
    .eq('slug', slug)
    .in('status', ['published', 'live'])
    .maybeSingle()

  if (!event) notFound()

  // Use admin client to read org Stripe status — anon RLS blocks these fields
  const { data: org } = await admin
    .from('organizations')
    .select('name, stripe_account_id, charges_enabled')
    .eq('id', event.org_id)
    .maybeSingle()

  // O147: the code itself is service-only; the page only needs to know
  // whether to ask for one. If that read fails, show the field anyway — the
  // server ignores a code on an open event but refuses a missing one.
  const [ticketsResult, formFields, invite] = await Promise.all([
    supabase
      .from('ticket_types')
      .select('*')
      .eq('event_id', event.id)
      .eq('is_active', true)
      .eq('is_visible', true)
      .order('sort_order', { ascending: true }),
    getFormFields(event.id),
    readEventInviteCode(event.id),
  ])
  const requiresInviteCode = 'error' in invite || invite.code !== null

  const paymentsEnabled = !!(org?.stripe_account_id && org?.charges_enabled)

  return (
    <RegisterPageClient
      event={event as unknown as Parameters<typeof RegisterPageClient>[0]["event"]}
      tickets={(ticketsResult.data ?? []) as Parameters<typeof RegisterPageClient>[0]['tickets']}
      formFields={formFields as Parameters<typeof RegisterPageClient>[0]['formFields']}
      paymentsEnabled={paymentsEnabled}
      requiresInviteCode={requiresInviteCode}
    />
  )
}
