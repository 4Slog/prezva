import { requireEventOrgAccess } from '@/lib/auth/require-event-access'
import { getEventTickets } from '@/lib/registration/ticket-actions'
import { TicketManager } from '@/components/registration/TicketManager'
import { DiscountCodeManager } from '@/components/registration/DiscountCodeManager'
import { getDiscountCodes } from '@/lib/events/discount-actions'
import { FormFieldManager } from '@/components/registration/FormFieldManager'
import { getFormFields } from '@/lib/events/form-field-actions'
import { createClient } from '@/lib/supabase/server'

type Props = { params: Promise<{ slug: string }> }

const ASSOCIATION_PROVIDERS = ['wildapricot', 'imis', 'memberclicks', 'yourmembership', 'glue_up', 'neon', 'novi']

export default async function TicketsPage({ params }: Props) {
  const { slug } = await params
  const { event } = await requireEventOrgAccess(slug)

  const [tickets, discountCodes, formFields] = await Promise.all([
    getEventTickets(event.id),
    getDiscountCodes(event.id),
    getFormFields(event.id),
  ])

  const supabase = await createClient()
  const { data: assocRows } = await supabase
    .from('org_integrations')
    .select('provider')
    .eq('org_id', event.org_id)
    .eq('status', 'connected')
    .in('provider', ASSOCIATION_PROVIDERS)
  const connectedAssociations = (assocRows ?? []).map(r => r.provider)

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs text-[var(--pz-muted)] mb-1">
            <a href={`/events/${slug}`} className="hover:text-[var(--pz-muted)]">← {event.title}</a>
          </p>
          <h1 className="text-xl font-bold text-[var(--pz-text)]">Tickets</h1>
        </div>
      </div>
      <TicketManager
        eventId={event.id}
        tickets={tickets as Parameters<typeof TicketManager>[0]['tickets']}
        connectedAssociations={connectedAssociations}
      />
      <DiscountCodeManager
        eventId={event.id}
        initial={discountCodes as any}
      />
      <FormFieldManager
        eventId={event.id}
        initial={formFields as any}
        tickets={(tickets as any[]).map((t: any) => ({ id: t.id, name: t.name }))}
      />
    </div>
  )
}
