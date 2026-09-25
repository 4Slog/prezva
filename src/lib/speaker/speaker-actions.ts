'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/get-user'
import { enqueueSpeakerInviteEmail } from '@/lib/trigger'
import { assertPermission } from '@/lib/auth/assert-permission'
import { catchPermission } from '@/lib/auth/permission-error'
import { getOrCreateSpeakerToken } from '@/lib/speaker/speaker-token'
import { escapeHtml } from '@/trigger/lib/escape'

// ── T-095a: speaker token management ──────────────────────────────────────────

export async function createSpeaker(eventId: string, input: {
  name: string
  email?: string
  job_title?: string
  company?: string
  bio?: string
  event_role?: string
}) {
  const admin = createAdminClient()
  const { data: event } = await admin.from('events').select('org_id').eq('id', eventId).single()
  if (!event) return { error: 'Event not found' }
  const user = await requireUser()
  try { await assertPermission((event as any).org_id, user.id, 'speakers.manage') } catch (e) { return catchPermission(e) }
  const { data, error } = await admin
    .from('speakers')
    .insert({
      event_id: eventId,
      name: input.name,
      email: input.email || null,
      job_title: input.job_title || null,
      company: input.company || null,
      bio: input.bio || null,
      event_role: input.event_role ?? 'speaker',
      status: 'invited',
      sort_order: 0,
    })
    .select('id, name, email, status')
    .single()
  if (error) return { error: error.message }
  return { data }
}

export async function validateSpeakerToken(token: string) {
  const supabase = createAdminClient()

  // Try speaker_tokens table first (legacy magic-link tokens, 64-char hex)
  const { data: tokenRow } = await supabase
    .from('speaker_tokens')
    .select('event_id, speaker_id, expires_at, speakers(name, email, event_id)')
    .eq('token', token)
    .maybeSingle()

  if (tokenRow) {
    if (new Date((tokenRow as any).expires_at) < new Date()) return null
    return tokenRow as any
  }

  // Fallback: look up by speakers.confirmation_token (48-char hex, used in invite/reminder URLs)
  const { data: speakerRow } = await supabase
    .from('speakers')
    .select('id, event_id, name, email')
    .eq('confirmation_token', token)
    .maybeSingle()

  if (!speakerRow) return null

  return {
    event_id: (speakerRow as any).event_id,
    speaker_id: (speakerRow as any).id,
    expires_at: null,
    speakers: {
      name: (speakerRow as any).name,
      email: (speakerRow as any).email,
      event_id: (speakerRow as any).event_id,
    },
  }
}

// Resolves an event's org and requires the caller to hold `key` on it.
// Returns the event, or { error } for a missing event or a missing permission.
async function authorizeEvent(
  eventId: string,
  key: 'speakers.manage',
): Promise<{ event: { id: string; org_id: string } } | { error: string }> {
  const user = await requireUser()
  const admin = createAdminClient()
  const { data: event } = await admin.from('events').select('id, org_id').eq('id', eventId).maybeSingle()
  if (!event) return { error: 'Event not found' }
  try { await assertPermission(event.org_id, user.id, key) } catch (e) { return catchPermission(e) }
  return { event }
}

// Speaker portal: the token alone identifies the speaker and the event.
async function speakerFromToken(token: string): Promise<{ eventId: string; speakerId: string } | null> {
  if (typeof token !== 'string' || !token) return null
  const data = await validateSpeakerToken(token)
  if (!data?.event_id || !data?.speaker_id) return null
  return { eventId: data.event_id as string, speakerId: data.speaker_id as string }
}

// ── T-095b: magic link invite ─────────────────────────────────────────────────

// The speaker row decides the event; the caller must hold speakers.manage on
// that event's org (checked inside getOrCreateSpeakerToken). The portal URL is
// built from the app's own origin, never a caller-supplied one.
export async function sendSpeakerInvite(eventId: string, speakerId: string) {
  const user = await requireUser()
  const admin = createAdminClient()

  const { data: speaker } = await admin
    .from('speakers')
    .select('id, event_id, email, name, ghl_contact_id')
    .eq('id', speakerId)
    .eq('event_id', eventId)
    .maybeSingle()
  if (!speaker) return { error: 'Speaker not found' }

  let issued: Awaited<ReturnType<typeof getOrCreateSpeakerToken>>
  try { issued = await getOrCreateSpeakerToken(speaker.id, { userId: user.id }) } catch (e) { return catchPermission(e) }
  if ('error' in issued) return { error: issued.error }

  if (!(speaker as any).email) return { error: 'Speaker has no email address' }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://prezva.app'
  const portalUrl = `${appUrl}/speaker/${issued.token}`

  const { data: eventRow } = await admin
    .from('events')
    .select('title, start_at, org_id')
    .eq('id', issued.eventId)
    .maybeSingle()

  const service = createServiceClient()
  const { error } = await service.auth.admin.generateLink({
    type: 'magiclink',
    email: (speaker as any).email,
    options: {
      redirectTo: portalUrl,
    },
  })

  // Enqueue branded invite email via Trigger.dev (non-blocking)
  void enqueueSpeakerInviteEmail({
    speakerName:  (speaker as any).name,
    speakerEmail: (speaker as any).email,
    eventTitle:   (eventRow as any)?.title ?? '',
    eventDate:    (eventRow as any)?.start_at ?? '',
    portalUrl,
    orgId: (eventRow as any)?.org_id,
    speakerId,
    speakerGhlContactId: (speaker as any)?.ghl_contact_id ?? null,
  })

  if (error) {
    return { portalUrl, warning: 'Magic link generation failed — use portal URL instead' }
  }

  return { portalUrl, sent: true }
}

// ── T-095j: confirmation token ────────────────────────────────────────────────

// /speaker/confirm: the token alone identifies the speaker and the event.
// confirmation_token is service-role only (0157), so the lookup uses the admin
// client; every write is then pinned to that speaker on that event and must
// hit a row.
async function speakerByToken(token: string) {
  if (typeof token !== 'string' || !token) return null
  const { data } = await createAdminClient()
    .from('speakers')
    .select('id, event_id, name, email, status, events(title, slug)')
    .eq('confirmation_token', token)
    .maybeSingle()
  return data
}

export async function getSpeakerByConfirmationToken(token: string) {
  return (await speakerByToken(token)) as any
}

export async function confirmSpeakerSlot(token: string, action: 'confirmed' | 'declined') {
  if (action !== 'confirmed' && action !== 'declined') return { error: 'Invalid response' }
  const sp = await speakerByToken(token)
  if (!sp) return { error: 'Invitation not found' }
  const admin = createAdminClient()
  const { data: updated, error } = await admin
    .from('speakers')
    .update({
      status: action,
      confirmed_at: action === 'confirmed' ? new Date().toISOString() : null,
    })
    .eq('id', sp.id)
    .eq('event_id', sp.event_id)
    .select('id')
  if (error) return { error: error.message }
  if (!updated?.length) return { error: 'Invitation not found' }

  if (action === 'confirmed') {
    const { data: spData } = await admin.from('speakers')
      .select('name, email, job_title, company, bio, photo_url, website, linkedin_url, twitter_handle, events(org_id)')
      .eq('id', sp.id)
      .single()
    if (spData && (spData as any).email) {
      await admin.from('org_speakers').upsert({
        org_id: (spData as any).events?.org_id,
        name: (spData as any).name,
        email: (spData as any).email,
        job_title: (spData as any).job_title,
        company: (spData as any).company,
        bio: (spData as any).bio,
        photo_url: (spData as any).photo_url,
        website: (spData as any).website,
        linkedin_url: (spData as any).linkedin_url,
        twitter_handle: (spData as any).twitter_handle,
        times_spoken: 1,
        last_spoken_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'org_id,email', ignoreDuplicates: false })
    }
  }

  return { error: undefined }
}

export async function declineSpeakerSlot(token: string, reason?: string, alternative?: string) {
  if ((reason != null && typeof reason !== 'string') || (alternative != null && typeof alternative !== 'string')) {
    return { error: 'Invalid response' }
  }
  const sp = await speakerByToken(token)
  if (!sp) return { error: 'Invitation not found' }
  const { data: updated, error } = await createAdminClient()
    .from('speakers')
    .update({
      status: 'declined',
      decline_reason: reason?.slice(0, 1000) || null,
      decline_alternative: alternative?.slice(0, 1000) || null,
    })
    .eq('id', sp.id)
    .eq('event_id', sp.event_id)
    .select('id')
  if (error) return { error: error.message }
  if (!updated?.length) return { error: 'Invitation not found' }
  return { error: undefined }
}

// ── T-095c: speaker form ──────────────────────────────────────────────────────

export async function getSpeakerFormSchema(eventId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('events')
    .select('speaker_form_schema')
    .eq('id', eventId)
    .single()
  return ((data as any)?.speaker_form_schema ?? []) as any[]
}

export async function saveSpeakerFormSchema(eventId: string, schema: any[]) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('events')
    .update({ speaker_form_schema: schema })
    .eq('id', eventId)
  return { error: error?.message }
}

// Speaker portal: event and speaker come from the token, never the caller.
export async function saveSpeakerFormSubmission(token: string, formData: Record<string, string>) {
  const ctx = await speakerFromToken(token)
  if (!ctx) return { error: 'Invalid speaker link' }
  if (!formData || typeof formData !== 'object' || Array.isArray(formData)) return { error: 'Invalid form data' }
  const entries = Object.entries(formData)
  if (entries.length > 200 || entries.some(([k, v]) => k.length > 200 || typeof v !== 'string' || v.length > 20000)) {
    return { error: 'Invalid form data' }
  }
  const admin = createAdminClient()
  const { error } = await admin
    .from('speaker_form_submissions')
    .upsert(
      { event_id: ctx.eventId, speaker_id: ctx.speakerId, data: Object.fromEntries(entries), updated_at: new Date().toISOString() },
      { onConflict: 'event_id,speaker_id' },
    )
  return { error: error?.message }
}

// ── T-095f: handouts ──────────────────────────────────────────────────────────

// Speaker portal (token only, no login): the speaker token must belong to the
// speaker who owns the handout, on the handout's own event.
export async function deleteHandout(token: string, handoutId: string) {
  const tokenData = await validateSpeakerToken(token)
  if (!tokenData) return { error: 'Invalid speaker link' }
  const admin = createAdminClient()
  const { data: handout } = await admin
    .from('session_handouts')
    .select('id, session_id, speaker_id, storage_path')
    .eq('id', handoutId)
    .maybeSingle()
  if (!handout || handout.speaker_id !== tokenData.speaker_id) return { error: 'Handout not found' }
  const { data: session } = await admin.from('sessions').select('event_id').eq('id', handout.session_id).maybeSingle()
  if (!session || session.event_id !== tokenData.event_id) return { error: 'Handout not found' }
  const { data: deleted, error } = await admin
    .from('session_handouts')
    .delete()
    .eq('id', handoutId)
    .eq('speaker_id', tokenData.speaker_id)
    .select('id')
  if (error) return { error: error.message }
  if (!deleted?.length) return { error: 'Handout not found' }
  if (handout.storage_path) {
    await admin.storage.from('speaker-handouts').remove([handout.storage_path])
  }
  return {}
}

// ── T-095g: polls ─────────────────────────────────────────────────────────────

// Speaker portal (token only): the token's speaker must be assigned to the
// session, and the session must be on the token's event.
export async function createPoll(token: string, sessionId: string, body: string, options: string[]) {
  const ctx = await speakerFromToken(token)
  if (!ctx) return { error: 'Invalid speaker link' }
  const question = typeof body === 'string' ? body.trim() : ''
  const opts = Array.isArray(options) ? options.filter(o => typeof o === 'string' && o.trim()).map(o => o.trim()) : []
  if (!question || question.length > 1000) return { error: 'Enter a question' }
  if (opts.length < 2 || opts.length > 10 || opts.some(o => o.length > 200)) return { error: 'Give 2 to 10 options' }

  const admin = createAdminClient()
  const { data: session } = await admin.from('sessions').select('id, event_id').eq('id', sessionId).maybeSingle()
  if (!session || session.event_id !== ctx.eventId) return { error: 'Session not found' }
  const { data: onSession } = await admin
    .from('session_speakers')
    .select('session_id')
    .eq('session_id', session.id)
    .eq('speaker_id', ctx.speakerId)
    .limit(1)
  if (!onSession?.length) return { error: 'Session not found' }

  const { error } = await admin.from('session_questions').insert({
    session_id: session.id,
    event_id: ctx.eventId,
    user_id: null,
    body: question,
    is_poll: true,
    poll_options: opts.map(opt => ({ label: opt, votes: 0 })),
  })
  return { error: error?.message }
}

// Speaker portal (token only): the token's speaker must be on the question's
// session, and the question must belong to the token's event.
export async function markQuestionAnswered(token: string, questionId: string) {
  const tokenData = await validateSpeakerToken(token)
  if (!tokenData) return { error: 'Invalid speaker link' }
  const admin = createAdminClient()
  const { data: question } = await admin
    .from('session_questions')
    .select('id, session_id, event_id')
    .eq('id', questionId)
    .maybeSingle()
  if (!question || question.event_id !== tokenData.event_id) return { error: 'Question not found' }
  const { data: onSession } = await admin
    .from('session_speakers')
    .select('session_id')
    .eq('session_id', question.session_id)
    .eq('speaker_id', tokenData.speaker_id)
    .limit(1)
  if (!onSession?.length) return { error: 'Question not found' }
  const { data: updated, error } = await admin
    .from('session_questions')
    .update({ answered_at: new Date().toISOString() })
    .eq('id', questionId)
    .eq('event_id', tokenData.event_id)
    .select('id')
  if (error) return { error: error.message }
  if (!updated?.length) return { error: 'Question not found' }
  return {}
}

// ── T-095d: speaker messaging ─────────────────────────────────────────────────
// speaker_conversations / speaker_messages are service-role only. Two doors:
// the speaker portal (authorized by the speaker token; ids come from the
// token; always posts as 'speaker') and the dashboard (speakers.manage on the
// event the row belongs to; always posts as 'organizer').

const MAX_MESSAGE = 5000

async function findOrCreateConversation(eventId: string, speakerId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('speaker_conversations')
    .select('id')
    .eq('event_id', eventId)
    .eq('speaker_id', speakerId)
    .maybeSingle()
  if (existing) return (existing as any).id as string
  const { data } = await admin
    .from('speaker_conversations')
    .insert({ event_id: eventId, speaker_id: speakerId })
    .select('id')
    .single()
  return ((data as any)?.id as string | undefined) ?? null
}

async function listMessages(conversationId: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('speaker_messages')
    .select('id, sender_role, body, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
  return (data ?? []) as any[]
}

function cleanBody(body: unknown): string | null {
  const text = typeof body === 'string' ? body.trim() : ''
  return text && text.length <= MAX_MESSAGE ? text : null
}

// Dashboard: the conversation's event comes from the row; speakers.manage on it.
async function authorizeConversation(conversationId: string) {
  const admin = createAdminClient()
  const { data: conv } = await admin
    .from('speaker_conversations')
    .select('id, event_id, speaker_id')
    .eq('id', conversationId)
    .maybeSingle()
  if (!conv) return { error: 'Conversation not found' } as const
  const auth = await authorizeEvent(conv.event_id, 'speakers.manage')
  if ('error' in auth) return auth
  return { conv: conv as { id: string; event_id: string; speaker_id: string } }
}

// Portal: the token's own conversation.
export async function getSpeakerPortalConversation(token: string): Promise<string | null> {
  const ctx = await speakerFromToken(token)
  if (!ctx) return null
  return findOrCreateConversation(ctx.eventId, ctx.speakerId)
}

export async function getSpeakerPortalMessages(token: string) {
  const ctx = await speakerFromToken(token)
  if (!ctx) return []
  const admin = createAdminClient()
  const { data: conv } = await admin
    .from('speaker_conversations')
    .select('id')
    .eq('event_id', ctx.eventId)
    .eq('speaker_id', ctx.speakerId)
    .maybeSingle()
  return conv ? listMessages((conv as any).id) : []
}

export async function sendSpeakerPortalMessage(token: string, body: string): Promise<{ error?: string }> {
  const ctx = await speakerFromToken(token)
  if (!ctx) return { error: 'Invalid speaker link' }
  const text = cleanBody(body)
  if (!text) return { error: 'Message is empty or too long' }
  const conversationId = await findOrCreateConversation(ctx.eventId, ctx.speakerId)
  if (!conversationId) return { error: 'Could not open the conversation' }
  const admin = createAdminClient()
  const { error } = await admin
    .from('speaker_messages')
    .insert({ conversation_id: conversationId, sender_role: 'speaker', body: text })
  return error ? { error: error.message } : {}
}

// Dashboard: the speaker row decides the event; it must be the event the page is on.
export async function getOrCreateSpeakerConversation(eventId: string, speakerId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data: speaker } = await admin.from('speakers').select('id, event_id').eq('id', speakerId).maybeSingle()
  if (!speaker || speaker.event_id !== eventId) return null
  const auth = await authorizeEvent(speaker.event_id, 'speakers.manage')
  if ('error' in auth) return null
  return findOrCreateConversation(speaker.event_id, speaker.id)
}

export async function getSpeakerMessages(conversationId: string) {
  const auth = await authorizeConversation(conversationId)
  if ('error' in auth) return []
  return listMessages(auth.conv.id)
}

export async function sendSpeakerMessage(conversationId: string, body: string): Promise<{ error?: string }> {
  const auth = await authorizeConversation(conversationId)
  if ('error' in auth) return { error: auth.error }
  const text = cleanBody(body)
  if (!text) return { error: 'Message is empty or too long' }
  const { conv } = auth
  const admin = createAdminClient()
  const { error } = await admin
    .from('speaker_messages')
    .insert({ conversation_id: conv.id, sender_role: 'organizer', body: text })
  if (error) return { error: error.message }

  const [{ data: speaker }, { data: event }] = await Promise.all([
    admin.from('speakers').select('name, email, confirmation_token').eq('id', conv.speaker_id).maybeSingle(),
    admin.from('events').select('title, organizations(name)').eq('id', conv.event_id).maybeSingle(),
  ])
  const orgName = (event as any)?.organizations?.name ?? 'Event organizer'

  const { data: recent } = await admin
    .from('speaker_messages')
    .select('created_at')
    .eq('conversation_id', conv.id)
    .eq('sender_role', 'organizer')
    .gte('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(2)
  const shouldEmail = !recent || recent.length <= 1

  if (shouldEmail && (speaker as any)?.email) {
    const hubUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://prezva.app'}/speaker/${(speaker as any).confirmation_token}`
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${orgName.replace(/[<>"\r\n]/g, '')} <noreply@prezva.app>`,
        to: (speaker as any).email,
        subject: `New message re: ${(event as any)?.title ?? 'your session'}`,
        html: `<p>Hi ${escapeHtml((speaker as any).name ?? '')},</p>
               <p>${escapeHtml(orgName)} sent you a message:</p>
               <blockquote style="border-left:3px solid #2DD4BF;padding:0 1rem;color:#555;white-space:pre-wrap">${escapeHtml(text)}</blockquote>
               <p><a href="${escapeHtml(hubUrl)}">View in your speaker hub →</a></p>`,
      }),
    }).catch(() => {})
  }

  return {}
}

// ── T-095e: bulk message ──────────────────────────────────────────────────────

export async function getSpeakersWithMissingInfo(eventId: string, missingField: string) {
  const auth = await authorizeEvent(eventId, 'speakers.manage')
  if ('error' in auth) return []
  const admin = createAdminClient()
  let q = admin.from('speakers').select('id, name, email, status').eq('event_id', eventId)
  if (missingField === 'bio') q = q.is('bio', null)
  if (missingField === 'photo') q = q.is('photo_url', null)
  if (missingField === 'form') {
    const { data: submissions } = await admin
      .from('speaker_form_submissions')
      .select('speaker_id')
      .eq('event_id', eventId)
    const submittedIds = ((submissions ?? []) as any[]).map(s => s.speaker_id)
    if (submittedIds.length > 0) q = q.not('id', 'in', `(${submittedIds.join(',')})`)
  }
  const { data } = await q
  return (data ?? []) as any[]
}

export async function markSpeakerArrived(speakerId: string) {
  const user = await requireUser()
  const admin = createAdminClient()
  const { data: sp } = await admin.from('speakers').select('event_id, events(org_id)').eq('id', speakerId).single()
  if (!sp) return { error: 'Not found' }
  try { await assertPermission((sp as any).events?.org_id, user.id, 'speakers.manage') } catch (e) { return catchPermission(e) }
  await admin.from('speakers').update({ checked_in_at: new Date().toISOString() }).eq('id', speakerId)
  return { ok: true }
}

export async function updateSpeakerDayOfInfo(eventId: string, text: string) {
  const user = await requireUser()
  const admin = createAdminClient()
  const { data: event } = await admin.from('events').select('org_id').eq('id', eventId).single()
  if (!event) return { error: 'Event not found' }
  try { await assertPermission((event as any).org_id, user.id, 'speakers.manage') } catch (e) { return catchPermission(e) }
  await admin.from('events').update({ speaker_day_of_info: text || null }).eq('id', eventId)
  return { ok: true }
}

// ── B11-34: token renewal ─────────────────────────────────────────────────────

export async function renewSpeakerToken(speakerId: string) {
  const user = await requireUser()
  const admin = createAdminClient()

  const { data: sp } = await admin
    .from('speakers')
    .select('id, event_id, name, email, events(org_id, title, organizations(name))')
    .eq('id', speakerId)
    .single()

  if (!sp) return { error: 'Speaker not found' }

  try { await assertPermission((sp as any).events?.org_id, user.id, 'speakers.manage') } catch (e) { return catchPermission(e) }

  const { nanoid } = await import('nanoid')
  const newToken = nanoid(32)

  await admin.from('speakers').update({ confirmation_token: newToken }).eq('id', speakerId)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://prezva.app'
  const hubUrl = `${appUrl}/speaker/${newToken}`
  const orgName = (sp as any).events?.organizations?.name ?? 'Event organizer'
  const eventTitle = (sp as any).events?.title ?? 'the event'

  if ((sp as any).email) {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${orgName} <noreply@prezva.app>`,
        to: (sp as any).email,
        subject: `Updated speaker portal link — ${eventTitle}`,
        html: `<p>Hi ${(sp as any).name},</p>
               <p>Your speaker portal link has been refreshed for ${eventTitle}.</p>
               <p><a href="${hubUrl}">Access your speaker hub →</a></p>
               <p>Your previous link is no longer active.</p>
               <p>— ${orgName}</p>`,
      }),
    }).catch(() => {})
  }

  return { ok: true, newToken, hubUrl }
}

// ── B11-35: handout delete (admin-auth version) ───────────────────────────────

export async function deleteHandoutAsOrg(handoutId: string, orgId: string) {
  const user = await requireUser()
  const admin = createAdminClient()

  // The handout's event comes from the handout row (via its session); it must
  // belong to the caller's org, and the permission is checked on that org.
  const { data: handout } = await admin
    .from('session_handouts')
    .select('id, session_id, storage_path')
    .eq('id', handoutId)
    .maybeSingle()
  if (!handout) return { error: 'Not found' }
  const { data: session } = await admin.from('sessions').select('event_id').eq('id', handout.session_id).maybeSingle()
  if (!session) return { error: 'Not found' }
  const { data: event } = await admin.from('events').select('id, org_id').eq('id', session.event_id).maybeSingle()
  if (!event || event.org_id !== orgId) return { error: 'Not found' }

  try { await assertPermission(event.org_id, user.id, 'speakers.manage') } catch (e) { return catchPermission(e) }

  const { data: deleted, error } = await admin
    .from('session_handouts')
    .delete()
    .eq('id', handoutId)
    .eq('session_id', handout.session_id)
    .select('id')
  if (error) return { error: error.message }
  if (!deleted?.length) return { error: 'Not found' }

  if (handout.storage_path) {
    await admin.storage.from('speaker-handouts').remove([handout.storage_path]).catch(() => {})
  }
  return { ok: true }
}

// ── B11-36: Q&A moderation ────────────────────────────────────────────────────

export async function moderateQAQuestion(
  questionId: string,
  action: 'hide' | 'pin' | 'unpin' | 'answer',
  answerText?: string,
) {
  const user = await requireUser()
  const admin = createAdminClient()

  const { data: q } = await admin
    .from('session_questions')
    .select('id, event_id, events(org_id)')
    .eq('id', questionId)
    .single()

  if (!q) return { error: 'Question not found' }

  try { await assertPermission((q as any).events?.org_id, user.id, 'speakers.manage') } catch (e) { return catchPermission(e) }

  const updates: Record<string, unknown> = {}
  if (action === 'hide')   updates.is_hidden = true
  if (action === 'pin')    updates.is_pinned = true
  if (action === 'unpin')  updates.is_pinned = false
  if (action === 'answer') updates.organizer_answer = answerText ?? ''

  await admin.from('session_questions').update(updates).eq('id', questionId)
  return { ok: true }
}

// ── B11-37: org speaker library ───────────────────────────────────────────────

export async function getOrgSpeakerLibrary(orgId: string) {
  const user = await requireUser()
  await assertPermission(orgId, user.id, 'org.speaker_library.view')
  const admin = createAdminClient()
  const { data } = await admin
    .from('org_speakers')
    .select('*')
    .eq('org_id', orgId)
    .order('times_spoken', { ascending: false })
  return (data ?? []) as any[]
}

export async function addSpeakerFromLibrary(eventId: string, orgSpeakerId: string) {
  const user = await requireUser()
  const admin = createAdminClient()

  const { data: event } = await admin.from('events').select('org_id').eq('id', eventId).single()
  if (!event) return { error: 'Event not found' }

  try { await assertPermission((event as any).org_id, user.id, 'speakers.manage') } catch (e) { return catchPermission(e) }

  const { data: libSpeaker } = await admin
    .from('org_speakers').select('*').eq('id', orgSpeakerId).single()
  if (!libSpeaker) return { error: 'Speaker not found in library' }

  const { data: existing } = await admin.from('speakers')
    .select('id').eq('event_id', eventId).eq('email', (libSpeaker as any).email).maybeSingle()
  if (existing) return { error: 'Speaker is already added to this event' }

  const { nanoid } = await import('nanoid')
  const token = nanoid(32)

  const { data: newSpeaker, error } = await admin.from('speakers').insert({
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
  }).select('id').single()

  if (error) return { error: error.message }
  return { ok: true, speakerId: (newSpeaker as any).id }
}
