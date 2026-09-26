import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { escapeHtml, safeDisplayName, safeSubject } from '@/lib/email/escape'

// Server-only post-event volunteer helpers. They take an eventId on trust (the
// caller — events/actions.ts's completion flow — authorizes first), so they
// must never be server-action exports.

export async function createVolunteerDebriefSurvey(eventId: string) {
  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('surveys')
    .select('id')
    .eq('event_id', eventId)
    .eq('audience', 'volunteers')
    .maybeSingle()

  if (existing) return { ok: true, surveyId: (existing as any).id }

  const { data: survey, error } = await admin
    .from('surveys')
    .insert({
      event_id: eventId,
      title: 'Volunteer Debrief',
      description: 'Help us improve future events. This takes 2 minutes.',
      status: 'active',
      audience: 'volunteers',
    })
    .select('id')
    .single()

  if (error || !survey) return { error: error?.message ?? 'Failed to create survey' }

  const questions = [
    { text: 'Overall, how would you rate your volunteer experience?', type: 'rating' },
    { text: 'Was your role and responsibilities clearly explained?', type: 'boolean' },
    { text: 'Did you have enough support from the event team?', type: 'boolean' },
    { text: 'What went well during your shift?', type: 'text' },
    { text: 'What could be improved for next time?', type: 'text' },
    { text: 'Would you volunteer at a future event?', type: 'boolean' },
  ]

  await admin.from('survey_questions').insert(
    questions.map((q, i) => ({
      survey_id: (survey as any).id,
      question_text: q.text,
      question_type: q.type,
      sort_order: i + 1,
      is_required: false,
    }))
  )

  return { ok: true, surveyId: (survey as any).id }
}

export async function sendVolunteerThankYouEmails(eventId: string) {
  const admin = createAdminClient()

  const { data: event } = await admin
    .from('events')
    .select('title, organizations(name)')
    .eq('id', eventId)
    .single()

  const { data: volunteers } = await admin
    .from('volunteers')
    .select('name, email, clocked_in_at, clocked_out_at, role')
    .eq('event_id', eventId)
    .eq('status', 'confirmed')
    .not('email', 'is', null)

  if (!volunteers?.length) return

  const eventTitle = (event as any)?.title ?? 'the event'
  const orgName = (event as any)?.organizations?.name ?? 'The organizer'

  const surveyResult = await createVolunteerDebriefSurvey(eventId)
  const surveyId = (surveyResult as any).surveyId
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://prezva.app'
  const surveyUrl = surveyId ? `${appUrl}/survey/${surveyId}` : null

  for (const vol of volunteers as any[]) {
    const clockedIn = vol.clocked_in_at ? new Date(vol.clocked_in_at) : null
    const clockedOut = vol.clocked_out_at ? new Date(vol.clocked_out_at) : null
    const hours = clockedIn && clockedOut
      ? ((clockedOut.getTime() - clockedIn.getTime()) / 3600000).toFixed(1)
      : null

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${safeDisplayName(orgName)} <noreply@prezva.app>`,
        to: vol.email,
        subject: safeSubject(`Thank you for volunteering at ${eventTitle}!`),
        html: `<p>Hi ${escapeHtml(vol.name ?? '')},</p>
               <p>Thank you for volunteering at <strong>${escapeHtml(eventTitle)}</strong>!</p>
               ${hours ? `<p>You contributed <strong>${hours} hours</strong> as ${escapeHtml(vol.role ?? '')}. That makes a real difference.</p>` : ''}
               <p>We truly appreciate your time and dedication.</p>
               ${surveyUrl ? `<p><a href="${surveyUrl}" style="display:inline-block;padding:10px 20px;background:#2DD4BF;color:#0D1B2A;text-decoration:none;border-radius:6px;font-weight:700">Share your feedback →</a></p>` : ''}
               <p>— ${escapeHtml(orgName)}</p>`,
      }),
    }).catch(() => {})
  }
}
