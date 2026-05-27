'use server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/get-user'

const MAX_PROMPT_CHARS = 500
const DAILY_LIMIT_PER_ORG = 20
const MODEL = 'claude-haiku-4-5-20251001'
const SYSTEM_PROMPT =
  'You are an event communications assistant. Write clear, professional announcements ' +
  'for event attendees. Keep responses concise — 2-3 sentences max unless asked for more.'

export async function draftAnnouncement(
  eventId: string,
  type: string,
  context: string,
): Promise<{ draft?: string; error?: string }> {
  if (!process.env.ANTHROPIC_API_KEY) return { error: 'AI drafting not configured' }

  const trimmedContext = (context ?? '').trim()
  if (!trimmedContext) return { error: 'Please describe what the announcement is about.' }
  if (trimmedContext.length > MAX_PROMPT_CHARS) {
    return { error: `Prompt too long (max ${MAX_PROMPT_CHARS} characters).` }
  }

  const user = await requireUser()
  const admin = createAdminClient()

  const { data: event } = await admin
    .from('events')
    .select('title, start_at, timezone, venue_name, venue_city, org_id, organizations(name)')
    .eq('id', eventId)
    .maybeSingle()
  if (!event) return { error: 'Event not found' }

  const orgId = (event as any).org_id as string

  // Authz: only org staff+ may draft.
  const { data: member } = await admin
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!member || !['owner', 'admin', 'staff'].includes((member as any).role)) {
    return { error: 'You do not have permission to draft announcements for this org.' }
  }

  // Rate limit: 20 drafts per org per rolling 24h.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count } = await admin
    .from('ai_drafts_log')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .gte('created_at', since)
  if ((count ?? 0) >= DAILY_LIMIT_PER_ORG) {
    return { error: `Daily AI draft limit reached (${DAILY_LIMIT_PER_ORG}/day). Try again tomorrow.` }
  }

  const orgName = (event as any)?.organizations?.name ?? 'the event organizer'
  const eventTitle = (event as any)?.title ?? 'the event'
  const eventDate = (event as any)?.start_at
    ? new Date((event as any).start_at).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : 'TBD'
  const venue =
    [(event as any)?.venue_name, (event as any)?.venue_city].filter(Boolean).join(', ') || 'TBD'

  const prompt = `Organization: ${orgName}
Event: ${eventTitle}
Date: ${eventDate}
Venue: ${venue}
Announcement type: ${type}
Additional context: ${trimmedContext}

Write the announcement now. Return only the announcement text, no subject line.`

  let response: Response
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 500,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
  } catch (err) {
    return { error: `AI request failed: ${err instanceof Error ? err.message : 'network error'}` }
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    return { error: `AI error (${response.status}): ${errText.slice(0, 200)}` }
  }

  const data = await response.json().catch(() => null)
  const draft = data?.content?.[0]?.text
  if (!draft) return { error: 'AI returned an empty response.' }

  // Log usage (fire-and-forget; failure should not block the user).
  await admin
    .from('ai_drafts_log')
    .insert({
      org_id: orgId,
      user_id: user.id,
      surface: 'announcement',
      prompt_chars: trimmedContext.length,
    })
    .then(() => undefined, () => undefined)

  return { draft }
}
