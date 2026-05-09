import { notFound } from 'next/navigation'
import { getEventBySlug } from '@/lib/events/actions'
import { getEventTickets } from '@/lib/registration/ticket-actions'
import { TicketManager } from '@/components/registration/TicketManager'

type Props = { params: Promise<{ slug: string }> }

export default async function TicketsPage({ params }: Props) {
  const { slug } = await params
  const event = await getEventBySlug(slug)
  if (!event) notFound()

  const tickets = await getEventTickets(event.id)

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs text-[#64748B] mb-1">
            <a href={`/events/${slug}`} className="hover:text-[#94A3B8]">← {event.title}</a>
          </p>
          <h1 className="text-xl font-bold text-[#F0F4F8]">Tickets</h1>
        </div>
      </div>
      <TicketManager
        eventId={event.id}
        tickets={tickets as Parameters<typeof TicketManager>[0]['tickets']}
      />
    </div>
  )
}
