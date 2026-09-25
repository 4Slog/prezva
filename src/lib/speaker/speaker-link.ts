import 'server-only'

import { randomBytes } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'

// Speaker portal links are /speaker/<speakers.confirmation_token> (the one
// token system since D-R3; speaker_tokens is retired). A link is valid while
//   now <= greatest(portal_token_expires_at, coalesce(end_at, start_at) + 30 days)
// 30 days covers the post-session email (which itself carries the link),
// late slide uploads and reading Q&A / feedback after the event. Deriving the
// bound from the event means moving the event later never breaks a link;
// portal_token_expires_at only extends it — a renew or invite after the
// window re-mints the token and sets it to now + 7 days.
export const SPEAKER_LINK_GRACE_DAYS = 30
export const RENEWED_SPEAKER_LINK_DAYS = 7
export const SPEAKER_LINK_EXPIRED_MESSAGE = 'This link has expired — ask the organizer to resend it'

const DAY_MS = 24 * 60 * 60 * 1000

type EventDates = { start_at: string | null; end_at: string | null }

export function speakerLinkExpiresAt(storedExpiry: string | null | undefined, event: EventDates): Date {
  const eventEnd = event.end_at ?? event.start_at
  const eventBound = eventEnd ? new Date(eventEnd).getTime() + SPEAKER_LINK_GRACE_DAYS * DAY_MS : -Infinity
  const stored = storedExpiry ? new Date(storedExpiry).getTime() : -Infinity
  // No bound at all (cannot happen: start_at/end_at are NOT NULL) → expired.
  return new Date(Math.max(eventBound, stored))
}

export function isSpeakerLinkExpired(storedExpiry: string | null | undefined, event: EventDates, now: Date = new Date()): boolean {
  const expiresAt = speakerLinkExpiresAt(storedExpiry, event).getTime()
  return !(Number.isFinite(expiresAt) && now.getTime() <= expiresAt)
}

// Same 48-hex shape the older links used; 192 bits of entropy.
export function newSpeakerLinkToken(): string {
  return randomBytes(24).toString('hex')
}

export function renewedSpeakerLinkExpiry(now: Date = new Date()): string {
  return new Date(now.getTime() + RENEWED_SPEAKER_LINK_DAYS * DAY_MS).toISOString()
}

export type SpeakerLink = {
  speaker: { id: string; event_id: string; name: string; email: string | null; status: string | null }
  event: { id: string; title: string; slug: string; start_at: string; end_at: string }
  expiresAt: Date
  expired: boolean
}

// Resolves a portal token to its speaker and event. null = unknown token;
// { expired: true } = a real link past its window (callers show the expired
// page rather than a 404, and never act on it).
export async function resolveSpeakerLink(token: string): Promise<SpeakerLink | null> {
  if (typeof token !== 'string' || !token) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from('speakers')
    .select('id, event_id, name, email, status, portal_token_expires_at, events(id, title, slug, start_at, end_at)')
    .eq('confirmation_token', token)
    .maybeSingle()
  const event = (data?.events ?? null) as SpeakerLink['event'] | null
  if (!data || !event) return null
  const expiresAt = speakerLinkExpiresAt(data.portal_token_expires_at as string | null, event)
  return {
    speaker: { id: data.id, event_id: data.event_id, name: data.name, email: data.email ?? null, status: data.status ?? null },
    event,
    expiresAt,
    expired: isSpeakerLinkExpired(data.portal_token_expires_at as string | null, event),
  }
}
