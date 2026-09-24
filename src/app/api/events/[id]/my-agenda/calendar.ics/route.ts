import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

function toIcsDate(iso: string) {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function escapeIcs(s: string) {
  return s.replace(/[\\;,]/g, '\\$&').replace(/\n/g, '\\n')
}

// Serves the signed-in caller's own bookmarks only. The export is a same-origin
// download link on /e/[slug]/my-agenda (shown only to signed-in users), so the
// session cookie travels with it; no userId is accepted from the URL.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Sign in to export your agenda', { status: 401 })
  const userId = user.id

  const admin = createAdminClient()

  const [{ data: bookmarks }, { data: event }] = await Promise.all([
    admin
      .from('session_bookmarks')
      .select('session_id')
      .eq('user_id', userId)
      .eq('event_id', id),
    admin
      .from('events')
      .select('title, slug, timezone, venue_name, venue_city')
      .eq('id', id)
      .maybeSingle(),
  ])

  if (!event) return new NextResponse('Not found', { status: 404 })

  const sessionIds = (bookmarks ?? []).map((b: any) => b.session_id)
  if (sessionIds.length === 0) {
    return new NextResponse('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Prezva//EN\r\nEND:VCALENDAR', {
      headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': `attachment; filename="my-agenda.ics"` },
    })
  }

  const { data: sessions } = await admin
    .from('sessions')
    .select('id, title, description, starts_at, ends_at, rooms(name), session_speakers(speakers(name))')
    .in('id', sessionIds)
    .order('starts_at', { ascending: true })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://prezva.app'

  const vevents = (sessions ?? []).map((s: any) => {
    const room = s.rooms?.name
    const location = room ?? [event.venue_name, event.venue_city].filter(Boolean).join(', ')
    const speakers = (s.session_speakers ?? []).map((ss: any) => ss.speakers?.name).filter(Boolean).join(', ')
    const descParts = [speakers && `Speakers: ${speakers}`, s.description].filter(Boolean)
    return [
      'BEGIN:VEVENT',
      `DTSTART:${toIcsDate(s.starts_at)}`,
      `DTEND:${toIcsDate(s.ends_at)}`,
      `SUMMARY:${escapeIcs(s.title)}`,
      descParts.length > 0 ? `DESCRIPTION:${escapeIcs(descParts.join(' | '))}` : '',
      location ? `LOCATION:${escapeIcs(location)}` : '',
      `URL:${appUrl}/e/${event.slug}/agenda`,
      `UID:session-${s.id}@prezva.app`,
      'END:VEVENT',
    ].filter(Boolean).join('\r\n')
  })

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Prezva//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...vevents,
    'END:VCALENDAR',
  ].join('\r\n')

  return new NextResponse(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="my-agenda.ics"`,
    },
  })
}
