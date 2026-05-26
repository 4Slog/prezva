import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

function toIcsDate(iso: string) {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function escapeIcs(s: string) {
  return s.replace(/[\\;,]/g, '\\$&').replace(/\n/g, '\\n')
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  const { id, sessionId } = await params
  const admin = createAdminClient()

  const [{ data: session }, { data: event }] = await Promise.all([
    admin
      .from('sessions')
      .select('title, description, starts_at, ends_at, rooms(name), session_speakers(speakers(name))')
      .eq('id', sessionId)
      .eq('event_id', id)
      .maybeSingle(),
    admin
      .from('events')
      .select('title, slug, timezone, venue_name, venue_city')
      .eq('id', id)
      .maybeSingle(),
  ])

  if (!session || !event) return new NextResponse('Not found', { status: 404 })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://prezva.app'
  const room = (session as any).rooms?.name
  const location = room ?? [event.venue_name, event.venue_city].filter(Boolean).join(', ')
  const speakers = ((session as any).session_speakers ?? [])
    .map((ss: any) => ss.speakers?.name)
    .filter(Boolean)
    .join(', ')
  const descParts = [speakers && `Speakers: ${speakers}`, session.description].filter(Boolean)

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Prezva//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `DTSTART:${toIcsDate(session.starts_at)}`,
    `DTEND:${toIcsDate(session.ends_at)}`,
    `SUMMARY:${escapeIcs(session.title)}`,
    descParts.length > 0 ? `DESCRIPTION:${escapeIcs(descParts.join(' | '))}` : '',
    location ? `LOCATION:${escapeIcs(location)}` : '',
    `URL:${appUrl}/e/${event.slug}/agenda`,
    `UID:session-${sessionId}@prezva.app`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n')

  return new NextResponse(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="session-${sessionId}.ics"`,
    },
  })
}
