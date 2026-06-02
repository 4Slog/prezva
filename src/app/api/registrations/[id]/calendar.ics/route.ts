import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // ICS bodies embed the registrant's email — gate this so only the registrant
  // or org staff can download. RLS on `registrations` enforces (user_id = auth.uid()
  // OR has_org_role(event_org_id, 'staff')), so the user-context client returns
  // nothing for unrelated callers.
  const supabase = await createClient()
  const { data: ownReg } = await supabase
    .from('registrations')
    .select('id')
    .eq('id', id)
    .maybeSingle()

  if (!ownReg) {
    return new NextResponse('Registration not found', { status: 404 })
  }

  // Once authorized, use admin client to assemble the ICS payload with joins.
  const admin = createAdminClient()
  const { data: reg } = await admin
    .from('registrations')
    .select('id, attendee_email, events(title, description, start_at, end_at, timezone, venue_name, venue_address, virtual_url, event_type, slug)')
    .eq('id', id)
    .maybeSingle()

  if (!reg) {
    return new NextResponse('Registration not found', { status: 404 })
  }

  const ev = reg.events as any
  if (!ev) {
    return new NextResponse('Event not found', { status: 404 })
  }

  const uid = `reg-${reg.id}@prezva.app`
  const now = toIcsDate(new Date())
  const start = toIcsDate(new Date(ev.start_at))
  const end = ev.end_at ? toIcsDate(new Date(ev.end_at)) : start

  const isVirtual = ['virtual', 'hybrid'].includes(ev.event_type ?? '')
  const location = isVirtual && ev.virtual_url
    ? ev.virtual_url
    : [ev.venue_name, ev.venue_address].filter(Boolean).join(', ') || (isVirtual ? 'Virtual event' : '')

  const url = `https://prezva.app/e/${ev.slug}`

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Prezva//Prezva Event Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${escapeIcs(ev.title ?? 'Event')}`,
    ev.description ? `DESCRIPTION:${escapeIcs(ev.description)}` : '',
    location ? `LOCATION:${escapeIcs(location)}` : '',
    `URL:${url}`,
    ev.virtual_url ? `X-GOOGLE-CONFERENCE:${ev.virtual_url}` : '',
    `ORGANIZER:MAILTO:noreply@prezva.app`,
    `ATTENDEE;RSVP=TRUE:MAILTO:${reg.attendee_email}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n')

  const filename = `${(ev.title ?? 'event').replace(/[^a-z0-9]/gi, '-').toLowerCase()}.ics`

  return new NextResponse(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}

function toIcsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}

function escapeIcs(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}
