import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

function toIcsDate(iso: string) {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function escapeIcs(s: string) {
  return s.replace(/[\\;,]/g, '\\$&').replace(/\n/g, '\\n')
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  // Admin client: public ICS download for event
  const admin = createAdminClient()
  const { data: event } = await admin
    .from('events')
    .select('title, description, start_at, end_at, venue_name, venue_city, venue_state')
    .eq('slug', slug)
    .maybeSingle()

  if (!event) return new NextResponse('Not found', { status: 404 })

  const location = [event.venue_name, event.venue_city, event.venue_state].filter(Boolean).join(', ')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://prezva.app'

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Prezva//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `DTSTART:${toIcsDate(event.start_at)}`,
    `DTEND:${toIcsDate(event.end_at)}`,
    `SUMMARY:${escapeIcs(event.title)}`,
    event.description ? `DESCRIPTION:${escapeIcs(event.description)}` : '',
    location ? `LOCATION:${escapeIcs(location)}` : '',
    `URL:${appUrl}/e/${slug}`,
    `UID:event-${slug}@prezva.app`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n')

  return new NextResponse(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${slug}.ics"`,
    },
  })
}
