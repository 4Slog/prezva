'use server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function draftAnnouncement(
  eventId: string,
  type: string,
  context: string,
): Promise<{ draft?: string; error?: string }> {
  if (!process.env.ANTHROPIC_API_KEY) return { error: 'AI drafting not configured' }

  const admin = createAdminClient()
  const { data: event } = await admin
    .from('events')
    .select('title, starts_at, timezone, venue_name, venue_city, organizations(name)')
    .eq('id', eventId)
    .single()

  const orgName = (event as any)?.organizations?.name ?? 'the event organizer'
  const eventTitle = (event as any)?.title ?? 'the event'
  const eventDate = event?.starts_at ? new Date(event.starts_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'TBD'
  const venue = [event?.venue_name, event?.venue_city].filter(Boolean).join(', ') || 'TBD'

  const prompt = `You are writing a professional event announcement for ${orgName}.
Event: ${eventTitle}
Date: ${eventDate}
Venue: ${venue}
Announcement type: ${type}
Additional context: ${context}

Write a concise, professional announcement (2-3 paragraphs max). Be warm but direct.
Return only the announcement text, no subject line.`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    return { error: `AI error: ${err.slice(0, 100)}` }
  }

  const data = await response.json()
  return { draft: data.content?.[0]?.text ?? '' }
}
