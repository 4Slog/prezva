import type { SupabaseClient } from '@supabase/supabase-js'

// In-app announcement notices (user_notifications, 0155). Shared by every
// announcement send path — the email/both delivery task and the two push-only
// paths (immediate send in announcements/actions.ts, scheduled poller) — so all
// of them reach the same audience (D-R2): every confirmed registration with an
// account, after the announcement's ticket-type targeting, regardless of what
// happens to email or push.
//
// Takes the client as an argument and imports nothing session-bound, so it is
// safe inside Trigger.dev tasks. The client must be service-role: users have
// no INSERT grant on user_notifications.
//
// Idempotent: (user_id, announcement_id) is unique and duplicates are ignored,
// so a reclaimed run never notifies anyone twice. Best-effort: a failure is
// logged and returned, never thrown.

type AudienceReg = { user_id?: string | null; ticket_type_id?: string | null }
type Filter = { types?: string[] | null } | null | undefined

export function filterAnnouncementAudience<T extends AudienceReg>(regs: T[], audience: Filter, exclude: Filter): T[] {
  const include = audience?.types ?? []
  const skip = exclude?.types ?? []
  return regs.filter(r =>
    (include.length === 0 || include.includes(r.ticket_type_id ?? '')) &&
    !skip.includes(r.ticket_type_id ?? ''),
  )
}

export function announcementEventUrl(slug: string | null | undefined): string {
  return slug ? `https://prezva.app/e/${slug}` : ''
}

export async function insertAnnouncementNotifications(
  admin: SupabaseClient,
  ann: { id: string; title: string; body: string | null },
  regs: AudienceReg[],
  eventUrl: string,
): Promise<{ error: string | null; count: number }> {
  const userIds = [...new Set(regs.map(r => r.user_id).filter((u): u is string => !!u))]
  if (userIds.length === 0) return { error: null, count: 0 }
  const rows = userIds.map(user_id => ({
    user_id,
    type: 'announcement' as const,
    title: ann.title,
    body: ann.body ? ann.body.slice(0, 120) : undefined,
    url: eventUrl || undefined,
    announcement_id: ann.id,
  }))
  const { error } = await admin
    .from('user_notifications')
    .upsert(rows, { onConflict: 'user_id,announcement_id', ignoreDuplicates: true })
  if (error) {
    console.error(`[announcement] in-app notification insert failed (announcement=${ann.id}, ${rows.length} users): ${error.message}`)
    return { error: error.message, count: 0 }
  }
  return { error: null, count: rows.length }
}

// For paths that have only the announcement id (push-only sends): loads the
// announcement, its event and its confirmed registrations, then inserts.
export async function notifyAnnouncementInApp(
  admin: SupabaseClient,
  announcementId: string,
): Promise<{ error: string | null; count: number }> {
  const { data: ann, error: annError } = await admin
    .from('announcements')
    .select('id, event_id, title, body, audience_filter, exclude_filter, events(slug)')
    .eq('id', announcementId)
    .maybeSingle()
  if (annError || !ann) {
    const message = annError?.message ?? 'announcement not found'
    console.error(`[announcement] in-app notify: ${message} (announcement=${announcementId})`)
    return { error: message, count: 0 }
  }
  const { data: regs, error: regError } = await admin
    .from('registrations')
    .select('user_id, ticket_type_id')
    .eq('event_id', ann.event_id)
    .eq('status', 'confirmed')
    .not('user_id', 'is', null)
  if (regError) {
    console.error(`[announcement] in-app notify: ${regError.message} (announcement=${announcementId})`)
    return { error: regError.message, count: 0 }
  }
  const slug = (ann.events as { slug?: string } | null)?.slug
  return insertAnnouncementNotifications(
    admin,
    ann,
    filterAnnouncementAudience(regs ?? [], ann.audience_filter as Filter, ann.exclude_filter as Filter),
    announcementEventUrl(slug),
  )
}
