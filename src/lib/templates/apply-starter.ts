import { createClient } from '@/lib/supabase/server'
import type { EventTemplate } from './types'

export async function applyStarterTemplate(
  eventId: string,
  template: EventTemplate,
  startAt: Date,
) {
  const supabase = await createClient()

  // Update event capacity
  if (template.capacity_default) {
    await supabase
      .from('events')
      .update({ capacity: template.capacity_default })
      .eq('id', eventId)
  }

  // Insert tracks first so we have IDs to reference (sessions may need them later)
  const trackIdMap: Record<string, string> = {}
  if (template.tracks && template.tracks.length > 0) {
    const { data: tracks } = await supabase
      .from('tracks')
      .insert(template.tracks.map((t) => ({ event_id: eventId, name: t.name, color: t.color })))
      .select('id, name')
    if (tracks) {
      for (const t of tracks as any[]) trackIdMap[t.name] = t.id
    }
  }

  // Insert ticket types
  if (template.ticket_types && template.ticket_types.length > 0) {
    await supabase.from('ticket_types').insert(
      template.ticket_types.map((tt) => ({
        event_id: eventId,
        name: tt.name,
        type: tt.type,
        price_cents: tt.price_cents,
        quantity: tt.quantity,
        description: tt.description ?? null,
      })),
    )
  }

  // Insert sessions offset from event start time
  if (template.sessions && template.sessions.length > 0) {
    await supabase.from('sessions').insert(
      template.sessions.map((s) => {
        const sessionStart = new Date(startAt)
        sessionStart.setDate(sessionStart.getDate() + (s.day - 1))
        sessionStart.setMinutes(sessionStart.getMinutes() + Math.round(s.hours_offset * 60))
        const sessionEnd = new Date(sessionStart)
        sessionEnd.setMinutes(sessionEnd.getMinutes() + s.duration)
        return {
          event_id: eventId,
          title: s.title,
          session_type: s.type,
          starts_at: sessionStart.toISOString(),
          ends_at: sessionEnd.toISOString(),
          is_published: true,
        }
      }),
    )
  }
}
