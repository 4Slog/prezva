'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/get-user'
import { enqueueSpeakerInviteEmail } from '@/lib/trigger'

// ── T-095a: speaker token management ──────────────────────────────────────────


export async function createSpeaker(eventId: string, input: {
  name: string
  email?: string
  job_title?: string
  company?: string
  bio?: string
  event_role?: string
}) {
  const supabase = await createClient()
  const admin = createAdminClient()
  const { data: event } = await admin.from('events').select('org_id').eq('id', eventId).single()
  if (!event) return { error: 'Event not found' }
  const user = await requireUser()
  const { assertOrgRole } = await import('@/lib/orgs/actions')
  await assertOrgRole(supabase, (event as any).org_id, user.id, ['owner', 'admin', 'staff'])
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

export async function getOrCreateSpeakerToken(eventId: string, speakerId: string) {
  // speaker_tokens is service-role only — bearer tokens must never be exposed
  // via RLS. Callers of this function are already org-staff-gated upstream.
  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('speaker_tokens')
    .select('token, expires_at')
    .eq('event_id', eventId)
    .eq('speaker_id', speakerId)
    .single()

  if (existing && new Date(existing.expires_at) > new Date()) {
    return existing.token as string
  }

  const { data } = await admin
    .from('speaker_tokens')
    .upsert({ event_id: eventId, speaker_id: speakerId }, { onConflict: 'event_id,speaker_id' })
    .select('token')
    .single()

  return (data as any)?.token as string | null
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

// ── T-095b: magic link invite ─────────────────────────────────────────────────

export async function sendSpeakerInvite(eventId: string, speakerId: string, appUrl: string) {
  const supabase = await createClient()

  const { data: speaker } = await supabase
    .from('speakers')
    .select('email, name')
    .eq('id', speakerId)
    .eq('event_id', eventId)
    .single()

  if (!(speaker as any)?.email) return { error: 'Speaker has no email address' }

  const token = await getOrCreateSpeakerToken(eventId, speakerId)
  if (!token) return { error: 'Failed to generate token' }

  const portalUrl = `${appUrl}/speaker/${token}`

  const { data: eventRow } = await supabase
    .from('events')
    .select('title, start_at')
    .eq('id', eventId)
    .single()

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
  })

  if (error) {
    return { portalUrl, warning: 'Magic link generation failed — use portal URL instead' }
  }

  return { portalUrl, sent: true }
}

// ── T-095j: confirmation token ────────────────────────────────────────────────

export async function getSpeakerByConfirmationToken(token: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('speakers')
    .select('id, event_id, name, email, status, events(title, slug)')
    .eq('confirmation_token', token)
    .single()
  return data as any
}

export async function confirmSpeakerSlot(token: string, action: 'confirmed' | 'declined') {
  const supabase = await createClient()
  const { error } = await supabase
    .from('speakers')
    .update({
      status: action,
      confirmed_at: action === 'confirmed' ? new Date().toISOString() : null,
    })
    .eq('confirmation_token', token)

  if (!error && action === 'confirmed') {
    const admin = createAdminClient()
    const { data: spData } = await admin.from('speakers')
      .select('name, email, job_title, company, bio, photo_url, website, linkedin_url, twitter_handle, events(org_id)')
      .eq('confirmation_token', token)
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

  return { error: error?.message }
}

export async function declineSpeakerSlot(token: string, reason?: string, alternative?: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('speakers')
    .update({
      status: 'declined',
      decline_reason: reason || null,
      decline_alternative: alternative || null,
    })
    .eq('confirmation_token', token)
  return { error: error?.message }
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

export async function getSpeakerFormSubmission(eventId: string, speakerId: string) {
  // speaker_form_submissions is service-role only.
  const admin = createAdminClient()
  const { data } = await admin
    .from('speaker_form_submissions')
    .select('data')
    .eq('event_id', eventId)
    .eq('speaker_id', speakerId)
    .single()
  return (data as any)?.data ?? {}
}

export async function saveSpeakerFormSubmission(eventId: string, speakerId: string, formData: Record<string, string>) {
  const admin = createAdminClient()
  const { error } = await admin
    .from('speaker_form_submissions')
    .upsert({ event_id: eventId, speaker_id: speakerId, data: formData, updated_at: new Date().toISOString() }, { onConflict: 'event_id,speaker_id' })
  return { error: error?.message }
}

// ── T-095f: handouts ──────────────────────────────────────────────────────────

export async function getSessionHandouts(sessionId: string) {
  // Speaker portal context has no auth.uid so the user-scoped RLS policy
  // returns nothing. Speakers are gated by the speaker_token upstream.
  const admin = createAdminClient()
  const { data } = await admin
    .from('session_handouts')
    .select('id, filename, storage_path, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
  return (data ?? []) as any[]
}

export async function deleteHandout(handoutId: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('session_handouts')
    .select('storage_path')
    .eq('id', handoutId)
    .single()
  if ((data as any)?.storage_path) {
    await admin.storage.from('speaker-handouts').remove([(data as any).storage_path])
  }
  const { error } = await admin.from('session_handouts').delete().eq('id', handoutId)
  return { error: error?.message }
}

// ── T-095g: polls ─────────────────────────────────────────────────────────────

export async function getSessionFeedbackForSpeaker(sessionIds: string[]) {
  if (sessionIds.length === 0) return {}
  // Speaker portal context has no auth.uid; attendees see only their own
  // feedback via RLS. Speakers reach this through speaker_token validation.
  const admin = createAdminClient()
  const { data } = await admin
    .from('session_feedback')
    .select('session_id, rating, comment, created_at')
    .in('session_id', sessionIds)
    .order('created_at', { ascending: false })
  const bySession: Record<string, { ratings: number[]; avg: number; count: number; comments: string[] }> = {}
  for (const fb of (data ?? []) as any[]) {
    if (!bySession[fb.session_id]) bySession[fb.session_id] = { ratings: [], avg: 0, count: 0, comments: [] }
    bySession[fb.session_id].ratings.push(fb.rating)
    if (fb.comment?.trim()) {
      bySession[fb.session_id].comments.push(fb.comment.trim())
    }
  }
  for (const val of Object.values(bySession)) {
    val.avg = val.ratings.reduce((s, r) => s + r, 0) / val.ratings.length
    val.count = val.ratings.length
    val.comments = val.comments.slice(0, 20)
  }
  return bySession
}

export async function getSpeakerSessionsWithQA(speakerId: string, eventId: string) {
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: sessionSpeakers } = await supabase
    .from('session_speakers')
    .select('session_id, role, sessions(id, title, starts_at, ends_at)')
    .eq('speaker_id', speakerId)

  const sessionIds = ((sessionSpeakers ?? []) as any[]).map(ss => ss.session_id)
  if (sessionIds.length === 0) return []

  const [{ data: questions }, { data: coSpeakerRows }, { data: handoutRows }] = await Promise.all([
    // session_questions read uses admin client — speaker portal has no auth.uid
    // and the user-scoped policy would only return the speaker's own questions.
    admin
      .from('session_questions')
      .select('id, session_id, body, upvote_count, is_poll, poll_options, answered_at, is_hidden, is_pinned, organizer_answer, created_at')
      .in('session_id', sessionIds)
      .eq('event_id', eventId)
      .eq('is_hidden', false)
      .order('is_pinned', { ascending: false })
      .order('upvote_count', { ascending: false }),
    supabase
      .from('session_speakers')
      .select('session_id, role, speakers(id, name, job_title, company, photo_url, event_role)')
      .in('session_id', sessionIds)
      .neq('speaker_id', speakerId),
    admin
      .from('session_handouts')
      .select('id, session_id, speaker_id, filename, storage_path, version, is_latest, created_at')
      .in('session_id', sessionIds)
      .eq('speaker_id', speakerId)
      .eq('is_latest', true)
      .order('created_at', { ascending: true }),
  ])

  return ((sessionSpeakers ?? []) as any[]).map(ss => ({
    session: ss.sessions ? { ...ss.sessions, session_role: ss.role ?? 'presenter' } : null,
    questions: ((questions ?? []) as any[]).filter(q => q.session_id === ss.session_id && !q.is_poll),
    polls: ((questions ?? []) as any[]).filter(q => q.session_id === ss.session_id && q.is_poll),
    handouts: ((handoutRows ?? []) as any[]).filter(h => h.session_id === ss.session_id),
    co_speakers: ((coSpeakerRows ?? []) as any[])
      .filter(cs => cs.session_id === ss.session_id)
      .map(cs => ({ ...cs.speakers, session_role: cs.role ?? 'presenter' }))
      .filter(Boolean),
  }))
}

export async function createPoll(sessionId: string, eventId: string, body: string, options: string[]) {
  const supabase = await createClient()
  const user = await supabase.auth.getUser()
  // Speakers can create polls from the token-gated portal (no auth.uid); use
  // admin client so both authenticated staff and token-only speakers work.
  const admin = createAdminClient()
  const { error } = await admin.from('session_questions').insert({
    session_id: sessionId,
    event_id: eventId,
    user_id: user.data.user?.id ?? null,
    body,
    is_poll: true,
    poll_options: options.map(opt => ({ label: opt, votes: 0 })),
  })
  return { error: error?.message }
}

export async function markQuestionAnswered(questionId: string) {
  const admin = createAdminClient()
  const { error } = await admin
    .from('session_questions')
    .update({ answered_at: new Date().toISOString() })
    .eq('id', questionId)
  return { error: error?.message }
}

// ── T-095d: speaker messaging ─────────────────────────────────────────────────

export async function getOrCreateSpeakerConversation(eventId: string, speakerId: string) {
  // speaker_conversations is service-role only; called from speaker portal and
  // org dashboard contexts.
  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('speaker_conversations')
    .select('id')
    .eq('event_id', eventId)
    .eq('speaker_id', speakerId)
    .single()

  if (existing) return (existing as any).id as string

  const { data } = await admin
    .from('speaker_conversations')
    .insert({ event_id: eventId, speaker_id: speakerId })
    .select('id')
    .single()
  return (data as any)?.id as string | null
}

export async function getSpeakerMessages(conversationId: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('speaker_messages')
    .select('id, sender_role, body, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
  return (data ?? []) as any[]
}

export async function sendSpeakerMessage(conversationId: string, senderRole: 'organizer' | 'speaker', body: string) {
  const admin = createAdminClient()
  const { error } = await admin
    .from('speaker_messages')
    .insert({ conversation_id: conversationId, sender_role: senderRole, body })
  if (error) return { error: error.message }

  if (senderRole === 'organizer') {
    const { data: conv } = await admin
      .from('speaker_conversations')
      .select('speaker_id, event_id, speakers(name, email, confirmation_token), events(title, organizations(name))')
      .eq('id', conversationId)
      .single()

    if (conv) {
      const speaker = (conv as any).speakers
      const event = (conv as any).events
      const orgName = event?.organizations?.name ?? 'Event organizer'
      const hubUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://prezva.app'}/speaker/${speaker?.confirmation_token}`

      const { data: recent } = await admin
        .from('speaker_messages')
        .select('created_at')
        .eq('conversation_id', conversationId)
        .eq('sender_role', 'organizer')
        .gte('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(2)

      const shouldEmail = !recent || recent.length <= 1

      if (shouldEmail && speaker?.email) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: `${orgName} <noreply@prezva.app>`,
            to: speaker.email,
            subject: `New message re: ${event?.title ?? 'your session'}`,
            html: `<p>Hi ${speaker.name},</p>
                   <p>${orgName} sent you a message:</p>
                   <blockquote style="border-left:3px solid #2DD4BF;padding:0 1rem;color:#555">${body}</blockquote>
                   <p><a href="${hubUrl}">View in your speaker hub →</a></p>`,
          }),
        }).catch(() => {})
      }
    }
  }

  return { error: undefined }
}

export async function getSpeakerConversations(eventId: string) {
  // speaker_conversations + speaker_messages are service-role only.
  const admin = createAdminClient()
  const { data } = await admin
    .from('speaker_conversations')
    .select('id, speaker_id, speakers(name, email), speaker_messages(body, created_at, sender_role)')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })
  return (data ?? []) as any[]
}

// ── T-095e: bulk message ──────────────────────────────────────────────────────

export async function getSpeakersWithMissingInfo(eventId: string, missingField: string) {
  const supabase = await createClient()
  const admin = createAdminClient()
  let q = supabase.from('speakers').select('id, name, email, status').eq('event_id', eventId)
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
  const supabase = await createClient()
  const user = await requireUser()
  const admin = createAdminClient()
  const { data: sp } = await admin.from('speakers').select('event_id, events(org_id)').eq('id', speakerId).single()
  if (!sp) return { error: 'Not found' }
  const { assertOrgRole } = await import('@/lib/orgs/actions')
  await assertOrgRole(supabase, (sp as any).events?.org_id, user.id, ['owner', 'admin', 'staff'])
  await admin.from('speakers').update({ checked_in_at: new Date().toISOString() }).eq('id', speakerId)
  return { ok: true }
}

export async function updateSpeakerDayOfInfo(eventId: string, text: string) {
  const supabase = await createClient()
  const user = await requireUser()
  const admin = createAdminClient()
  const { data: event } = await admin.from('events').select('org_id').eq('id', eventId).single()
  if (!event) return { error: 'Event not found' }
  const { assertOrgRole } = await import('@/lib/orgs/actions')
  await assertOrgRole(supabase, (event as any).org_id, user.id, ['owner', 'admin', 'staff'])
  await admin.from('events').update({ speaker_day_of_info: text || null }).eq('id', eventId)
  return { ok: true }
}

// ── B11-34: token renewal ─────────────────────────────────────────────────────

export async function renewSpeakerToken(speakerId: string) {
  const supabase = await createClient()
  const user = await requireUser()
  const admin = createAdminClient()

  const { data: sp } = await admin
    .from('speakers')
    .select('id, event_id, name, email, events(org_id, title, organizations(name))')
    .eq('id', speakerId)
    .single()

  if (!sp) return { error: 'Speaker not found' }

  const { assertOrgRole } = await import('@/lib/orgs/actions')
  await assertOrgRole(supabase, (sp as any).events?.org_id, user.id, ['owner', 'admin', 'staff'])

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
  const supabase = await createClient()
  const user = await requireUser()
  const admin = createAdminClient()

  const { assertOrgRole } = await import('@/lib/orgs/actions')
  await assertOrgRole(supabase, orgId, user.id, ['owner', 'admin', 'staff'])

  const { data: handout } = await admin
    .from('session_handouts')
    .select('id, storage_path')
    .eq('id', handoutId)
    .single()

  if (!handout) return { error: 'Not found' }

  const storagePath = (handout as any).storage_path
  if (storagePath) {
    await admin.storage.from('speaker-handouts').remove([storagePath]).catch(() => {})
  }

  await admin.from('session_handouts').delete().eq('id', handoutId)
  return { ok: true }
}

// ── B11-36: Q&A moderation ────────────────────────────────────────────────────

export async function moderateQAQuestion(
  questionId: string,
  action: 'hide' | 'pin' | 'unpin' | 'answer',
  answerText?: string,
) {
  const supabase = await createClient()
  const user = await requireUser()
  const admin = createAdminClient()

  const { data: q } = await admin
    .from('session_questions')
    .select('id, event_id, events(org_id)')
    .eq('id', questionId)
    .single()

  if (!q) return { error: 'Question not found' }

  const { assertOrgRole } = await import('@/lib/orgs/actions')
  await assertOrgRole(supabase, (q as any).events?.org_id, user.id, ['owner', 'admin', 'staff'])

  const updates: Record<string, unknown> = {}
  if (action === 'hide')   updates.is_hidden = true
  if (action === 'pin')    updates.is_pinned = true
  if (action === 'unpin')  updates.is_pinned = false
  if (action === 'answer') updates.organizer_answer = answerText ?? ''

  await admin.from('session_questions').update(updates).eq('id', questionId)
  return { ok: true }
}

export async function getQAQuestionsForEvent(eventId: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('session_questions')
    .select('id, session_id, body, upvote_count, is_hidden, is_pinned, organizer_answer, created_at, sessions(title)')
    .eq('event_id', eventId)
    .eq('is_poll', false)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })
  return (data ?? []) as any[]
}

// ── B11-37: org speaker library ───────────────────────────────────────────────

export async function getOrgSpeakerLibrary(orgId: string) {
  const supabase = await createClient()
  const user = await requireUser()
  const { assertOrgRole } = await import('@/lib/orgs/actions')
  await assertOrgRole(supabase, orgId, user.id, ['owner', 'admin', 'staff'])
  const admin = createAdminClient()
  const { data } = await admin
    .from('org_speakers')
    .select('*')
    .eq('org_id', orgId)
    .order('times_spoken', { ascending: false })
  return (data ?? []) as any[]
}

export async function addSpeakerFromLibrary(eventId: string, orgSpeakerId: string) {
  const supabase = await createClient()
  const user = await requireUser()
  const admin = createAdminClient()

  const { data: event } = await admin.from('events').select('org_id').eq('id', eventId).single()
  if (!event) return { error: 'Event not found' }

  const { assertOrgRole } = await import('@/lib/orgs/actions')
  await assertOrgRole(supabase, (event as any).org_id, user.id, ['owner', 'admin', 'staff'])

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
