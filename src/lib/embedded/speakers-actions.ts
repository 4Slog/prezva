'use server'

import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyEmbeddedSession, COOKIE_NAME } from '@/lib/embedded/session'
import { getOrCreateSpeakerToken } from '@/lib/speaker/speaker-actions'
import { enqueueGhlSpeakerMessage } from '@/lib/trigger'
import { z } from 'zod'

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

// ── Embed context ─────────────────────────────────────────────────────────────

async function resolveEmbedContext() {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) throw new Error('No embed session')
  const session = await verifyEmbeddedSession(token)
  const db = createAdminClient()
  const { data: link } = await db
    .from('ghl_location_links')
    .select('org_id')
    .eq('ghl_location_id', session.location_id)
    .maybeSingle()
  if (!link) throw new Error('Location not linked to any organization')
  return { db, orgId: link.org_id }
}

async function assertEventOwnership(
  db: ReturnType<typeof createAdminClient>,
  eventId: string,
  orgId: string,
) {
  const { data } = await db
    .from('events')
    .select('id, org_id')
    .eq('id', eventId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!data) throw new Error('Event not found or access denied')
  return data
}

// ── Zod schema ────────────────────────────────────────────────────────────────

const SpeakerInputSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().nullable().optional(),
  job_title: z.string().max(255).nullable().optional(),
  company: z.string().max(255).nullable().optional(),
  bio: z.string().nullable().optional(),
  event_role: z.enum(['speaker', 'mc', 'chair', 'host', 'guest', 'vip']).default('speaker'),
})

// ── Page data ─────────────────────────────────────────────────────────────────

export async function embedGetSpeakersPageData(eventId: string) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)

  const [eventResult, speakersResult] = await Promise.all([
    db.from('events').select('id, title, org_id, speaker_day_of_info').eq('id', eventId).single(),
    db
      .from('speakers')
      .select(
        'id, name, email, bio, photo_url, job_title, company, status, confirmed_at, confirmation_token, is_published, decline_reason, checked_in_at',
      )
      .eq('event_id', eventId)
      .order('sort_order', { ascending: true }),
  ])

  return {
    event: eventResult.data as any,
    speakers: (speakersResult.data ?? []) as any[],
  }
}

// ── Roster ────────────────────────────────────────────────────────────────────

export async function embedGetSpeakers(eventId: string) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)
  const { data } = await db
    .from('speakers')
    .select(
      'id, name, email, bio, photo_url, job_title, company, status, confirmed_at, confirmation_token, is_published, decline_reason, checked_in_at',
    )
    .eq('event_id', eventId)
    .order('sort_order', { ascending: true })
  return (data ?? []) as any[]
}

export async function embedCreateSpeaker(eventId: string, input: unknown) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)
  const parsed = SpeakerInputSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { data, error } = await db
    .from('speakers')
    .insert({
      event_id: eventId,
      name: parsed.data.name,
      email: parsed.data.email ?? null,
      job_title: parsed.data.job_title ?? null,
      company: parsed.data.company ?? null,
      bio: parsed.data.bio ?? null,
      event_role: parsed.data.event_role,
      status: 'invited',
      sort_order: 0,
    })
    .select('id, name, email, status')
    .single()
  if (error) return { error: error.message }
  return { data }
}

export async function embedUpdateSpeaker(
  eventId: string,
  speakerId: string,
  patch: unknown,
) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)
  const parsed = SpeakerInputSchema.partial().safeParse(patch)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { data, error } = await db
    .from('speakers')
    .update(parsed.data)
    .eq('id', speakerId)
    .eq('event_id', eventId)
    .select()
    .single()
  if (error) return { error: error.message }
  return { data }
}

export async function embedDeleteSpeaker(eventId: string, speakerId: string) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)
  const { error } = await db
    .from('speakers')
    .delete()
    .eq('id', speakerId)
    .eq('event_id', eventId)
  if (error) return { error: error.message }
  return { success: true }
}

export async function embedMarkSpeakerArrived(eventId: string, speakerId: string) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)
  const { error } = await db
    .from('speakers')
    .update({ checked_in_at: new Date().toISOString() })
    .eq('id', speakerId)
    .eq('event_id', eventId)
  if (error) return { error: error.message }
  return { ok: true }
}

export async function embedUpdateSpeakerDayOfInfo(eventId: string, text: string) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)
  const { error } = await db
    .from('events')
    .update({ speaker_day_of_info: text || null })
    .eq('id', eventId)
  if (error) return { error: error.message }
  return { ok: true }
}

// ── Org speaker library ───────────────────────────────────────────────────────

export async function embedGetOrgSpeakerLibrary(eventId: string) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)
  const { data } = await db
    .from('org_speakers')
    .select('*')
    .eq('org_id', orgId)
    .order('times_spoken', { ascending: false })
  return (data ?? []) as any[]
}

export async function embedAddSpeakerFromLibrary(eventId: string, orgSpeakerId: string) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)

  // Cross-org protection: verify the library row belongs to the resolved orgId
  const { data: libSpeaker } = await db
    .from('org_speakers')
    .select('*')
    .eq('id', orgSpeakerId)
    .eq('org_id', orgId)
    .single()
  if (!libSpeaker) return { error: 'Speaker not found in library' }

  if ((libSpeaker as any).email) {
    const { data: existing } = await db
      .from('speakers')
      .select('id')
      .eq('event_id', eventId)
      .eq('email', (libSpeaker as any).email)
      .maybeSingle()
    if (existing) return { error: 'Speaker is already added to this event' }
  }

  const { nanoid } = await import('nanoid')
  const token = nanoid(32)

  const { data: newSpeaker, error } = await db
    .from('speakers')
    .insert({
      event_id: eventId,
      name: (libSpeaker as any).name,
      email: (libSpeaker as any).email,
      job_title: (libSpeaker as any).job_title,
      company: (libSpeaker as any).company,
      bio: (libSpeaker as any).bio,
      photo_url: (libSpeaker as any).photo_url,
      website: (libSpeaker as any).website,
      linkedin_url: (libSpeaker as any).linkedin_url,
      twitter_handle: (libSpeaker as any).twitter_handle,
      status: 'invited',
      confirmation_token: token,
      sort_order: 0,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }
  return { ok: true, speakerId: (newSpeaker as any).id }
}

// ── Comms: invite via GHL ─────────────────────────────────────────────────────

export async function embedSendSpeakerInvite(eventId: string, speakerId: string) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)

  const { data: speaker } = await db
    .from('speakers')
    .select('id, name, email')
    .eq('id', speakerId)
    .eq('event_id', eventId)
    .single()
  if (!speaker) return { error: 'Speaker not found' }
  if (!(speaker as any).email) return { error: 'Speaker has no email address' }

  const token = await getOrCreateSpeakerToken(eventId, speakerId)
  if (!token) return { error: 'Failed to generate token' }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://prezva.app'
  const portalUrl = `${appUrl}/speaker/${token}`

  const { data: event } = await db.from('events').select('title, start_at').eq('id', eventId).single()
  const eventTitle = (event as any)?.title ?? ''
  const eventDate  = (event as any)?.start_at ?? ''
  const fmtDate = (d: string) =>
    d ? new Date(d).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : ''

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#0D1B2A;padding:24px 32px;border-radius:12px 12px 0 0;">
        <div style="background:#00BFA6;width:32px;height:32px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;">
          <span style="color:#0D1B2A;font-weight:900;font-size:18px;">P</span>
        </div>
        <h1 style="color:#F0F4F8;font-size:20px;margin:0;">You're Speaking at ${escapeHtml(eventTitle)}</h1>
      </div>
      <div style="background:#0F2236;padding:24px 32px;border-radius:0 0 12px 12px;color:#CBD5E1;">
        <p style="font-size:15px;">Hi ${escapeHtml((speaker as any).name)},</p>
        <p style="font-size:15px;">We're excited to have you speak at <strong style="color:#F0F4F8;">${escapeHtml(eventTitle)}</strong>${eventDate ? ` on <strong style="color:#F0F4F8;">${escapeHtml(fmtDate(eventDate))}</strong>` : ''}.</p>
        <p style="font-size:15px;">Your speaker portal gives you access to:</p>
        <ul style="padding-left:20px;line-height:1.8;font-size:15px;">
          <li>📋 Your session details and room assignment</li>
          <li>📎 A/V and slide submission</li>
          <li>👥 Attendee Q&amp;A and engagement tools</li>
          <li>🎟 Complimentary badge and check-in QR code</li>
        </ul>
        <div style="margin:24px 0;">
          <a href="${escapeHtml(portalUrl)}"
             style="background:#00BFA6;color:#0D1B2A;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block;">
            Access Your Speaker Portal
          </a>
        </div>
        <p style="color:#94A3B8;font-size:13px;">
          No Prezva account required — your portal link is all you need. It stays active through the event.
        </p>
        <hr style="border:none;border-top:1px solid #1E3A5F;margin:20px 0;" />
        <p style="color:#475569;font-size:12px;margin:0;">
          Questions about your session? Reply to this email and the organizer will follow up.
        </p>
      </div>
    </div>
  `

  await enqueueGhlSpeakerMessage({
    speakerId,
    eventId,
    orgId,
    subject: `You're speaking at ${eventTitle} — here's your portal`,
    html,
  })

  return { ok: true, portalUrl }
}

// ── Comms: renew portal token via GHL ────────────────────────────────────────

export async function embedRenewSpeakerToken(eventId: string, speakerId: string) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)

  const { data: speaker } = await db
    .from('speakers')
    .select('id, name, email')
    .eq('id', speakerId)
    .eq('event_id', eventId)
    .single()
  if (!speaker) return { error: 'Speaker not found' }

  const { nanoid } = await import('nanoid')
  const newToken = nanoid(32)

  const { error } = await db
    .from('speakers')
    .update({ confirmation_token: newToken })
    .eq('id', speakerId)
    .eq('event_id', eventId)
  if (error) return { error: error.message }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://prezva.app'
  const hubUrl = `${appUrl}/speaker/${newToken}`

  const { data: event } = await db.from('events').select('title').eq('id', eventId).single()
  const eventTitle = (event as any)?.title ?? 'the event'

  if ((speaker as any).email) {
    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#0D1B2A;padding:24px 32px;border-radius:12px 12px 0 0;">
          <div style="background:#00BFA6;width:32px;height:32px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;">
            <span style="color:#0D1B2A;font-weight:900;font-size:18px;">P</span>
          </div>
          <h1 style="color:#F0F4F8;font-size:20px;margin:0;">Updated speaker portal link</h1>
        </div>
        <div style="background:#0F2236;padding:24px 32px;border-radius:0 0 12px 12px;color:#CBD5E1;">
          <p style="font-size:15px;">Hi ${escapeHtml((speaker as any).name)},</p>
          <p style="font-size:15px;">Your speaker portal link has been refreshed for <strong style="color:#F0F4F8;">${escapeHtml(eventTitle)}</strong>.</p>
          <div style="margin:24px 0;">
            <a href="${escapeHtml(hubUrl)}"
               style="background:#00BFA6;color:#0D1B2A;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block;">
              Access your speaker hub →
            </a>
          </div>
          <p style="color:#94A3B8;font-size:13px;">Your previous link is no longer active.</p>
        </div>
      </div>
    `
    await enqueueGhlSpeakerMessage({
      speakerId,
      eventId,
      orgId,
      subject: `Updated speaker portal link — ${eventTitle}`,
      html,
    })
  }

  return { ok: true, newToken, hubUrl }
}

// ── Intake form schema (org-scoped) ──────────────────────────────────────────

export async function embedGetSpeakerFormSchema(eventId: string) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)
  const { data } = await db.from('events').select('speaker_form_schema').eq('id', eventId).single()
  return ((data as any)?.speaker_form_schema ?? []) as any[]
}

export async function embedSaveSpeakerFormSchema(eventId: string, schema: any[]) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)
  const { error } = await db.from('events').update({ speaker_form_schema: schema }).eq('id', eventId)
  return { error: error?.message }
}
