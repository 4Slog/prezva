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

  // Apply feature flags to the event record
  const flags: Record<string, unknown> = {}
  if (template.is_hybrid !== undefined)          flags.is_hybrid           = template.is_hybrid
  if (template.is_virtual !== undefined)         flags.is_virtual          = template.is_virtual
  if (template.ce_credits_enabled !== undefined) flags.ce_credits_enabled  = template.ce_credits_enabled
  if (template.member_gating !== undefined)      flags.member_gating       = template.member_gating
  if (template.fundraising_enabled !== undefined)flags.fundraising_enabled = template.fundraising_enabled
  if (template.leaderboard_enabled !== undefined)flags.leaderboard_enabled = template.leaderboard_enabled
  if (template.icebreakers_enabled !== undefined)flags.icebreakers_enabled = template.icebreakers_enabled
  if (template.passport_enabled !== undefined)   flags.passport_enabled    = template.passport_enabled
  if (Object.keys(flags).length > 0) {
    await supabase.from('events').update(flags).eq('id', eventId)
  }

  // Starter announcements and survey are informational — no DB writes needed here
  // (organizer sees them pre-selected in the announcements UI after event creation)
}
