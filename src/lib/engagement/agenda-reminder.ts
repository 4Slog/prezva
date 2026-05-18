'use server'

import { createAdminClient } from '@/lib/supabase/admin'

export async function sendDailyAgendaReminder(eventId: string, date: string) {
  const admin = createAdminClient()

  const { data: event } = await admin
    .from('events')
    .select('title, slug, timezone')
    .eq('id', eventId)
    .maybeSingle()
  if (!event) return { error: 'Event not found' }

  const dayStart = new Date(date)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(date)
  dayEnd.setHours(23, 59, 59, 999)

  // Find sessions on this date
  const { data: sessions } = await admin
    .from('sessions')
    .select('id, title, starts_at, ends_at, rooms(name)')
    .eq('event_id', eventId)
    .gte('starts_at', dayStart.toISOString())
    .lte('starts_at', dayEnd.toISOString())
    .order('starts_at', { ascending: true })

  if (!sessions?.length) return { sent: 0 }

  // Find all users with bookmarks for any of these sessions
  const sessionIds = sessions.map((s: any) => s.id)
  const { data: bookmarks } = await admin
    .from('session_bookmarks')
    .select('user_id, session_id')
    .in('session_id', sessionIds)
    .eq('event_id', eventId)

  if (!bookmarks?.length) return { sent: 0 }

  // Group bookmarks by user
  const byUser: Record<string, string[]> = {}
  for (const b of bookmarks) {
    if (!byUser[b.user_id]) byUser[b.user_id] = []
    byUser[b.user_id].push(b.session_id)
  }

  const userIds = Object.keys(byUser)
  if (userIds.length === 0) return { sent: 0 }

  // Fetch user emails via admin auth
  const { data: authData } = await admin.auth.admin.listUsers()
  const emailMap: Record<string, string> = {}
  for (const u of authData?.users ?? []) {
    if (u.email) emailMap[u.id] = u.email
  }

  const sessionMap: Record<string, any> = {}
  for (const s of sessions) sessionMap[(s as any).id] = s

  let sent = 0
  for (const userId of userIds) {
    const email = emailMap[userId]
    if (!email) continue

    const userSessions = byUser[userId]
      .map((sid: string) => sessionMap[sid])
      .filter(Boolean)
      .sort((a: any, b: any) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())

    const sessionLines = userSessions.map((s: any) => {
      const time = new Date(s.starts_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: event.timezone })
      const room = (s as any).rooms?.name ? ` · ${(s as any).rooms.name}` : ''
      return `• ${s.title} — ${time}${room}`
    }).join('\n')

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Prezva <noreply@prezva.app>',
        to: email,
        subject: `Your agenda for today at ${event.title}`,
        text: `Here are your bookmarked sessions for today:\n\n${sessionLines}\n\nView full agenda: https://prezva.app/e/${event.slug}/my-agenda`,
      }),
    })
    sent++
  }

  return { sent }
}
