'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { assertOrgRole } from '@/lib/orgs/actions'

export async function respondToVolunteerShift(
  token: string,
  response: 'confirmed' | 'declined',
  declineReason?: string
) {
  const admin = createAdminClient()
  const { data: vol } = await admin
    .from('volunteers')
    .select('id, name, event_id, email, events(title, org_id, organizations(name))')
    .eq('portal_access_token', token)
    .single()

  if (!vol) return { error: 'Invalid token' }

  await admin.from('volunteers').update({
    shift_response: response,
    shift_response_at: new Date().toISOString(),
    shift_decline_reason: declineReason ?? null,
  }).eq('id', (vol as any).id)

  const eventTitle = (vol as any).events?.title ?? 'the event'

  const { data: members } = await admin
    .from('org_members')
    .select('profiles(email)')
    .eq('org_id', (vol as any).events?.org_id)
    .in('role', ['owner', 'admin'])
    .limit(1)

  const orgEmail = (members?.[0] as any)?.profiles?.email
  if (orgEmail) {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Prezva <noreply@prezva.app>',
        to: orgEmail,
        subject: `Volunteer ${response}: ${(vol as any).name} — ${eventTitle}`,
        html: `<p>${(vol as any).name} has <strong>${response}</strong> their volunteer shift for ${eventTitle}.</p>
               ${declineReason ? `<p>Reason: ${declineReason}</p>` : ''}`,
      }),
    }).catch(() => {})
  }

  return { ok: true, response }
}

export async function sendVolunteerAlert(
  token: string,
  alertType: 'urgent' | 'issue' | 'question' | 'info',
  message: string
) {
  const admin = createAdminClient()
  const { data: vol } = await admin
    .from('volunteers')
    .select('id, name, event_id, events(title, org_id, organizations(name))')
    .eq('portal_access_token', token)
    .single()

  if (!vol) return { error: 'Invalid token' }

  await admin.from('volunteer_alerts').insert({
    event_id: (vol as any).event_id,
    volunteer_id: (vol as any).id,
    alert_type: alertType,
    message,
  })

  if (alertType === 'urgent') {
    const { data: members } = await admin
      .from('org_members')
      .select('profiles(email)')
      .eq('org_id', (vol as any).events?.org_id)
      .in('role', ['owner', 'admin'])
      .limit(2)

    for (const m of (members ?? []) as any[]) {
      const orgEmail = m?.profiles?.email
      if (!orgEmail) continue
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Prezva Alerts <noreply@prezva.app>',
          to: orgEmail,
          subject: `URGENT: ${(vol as any).name} — ${(vol as any).events?.title}`,
          html: `<p><strong>Urgent alert from volunteer ${(vol as any).name}:</strong></p>
                 <p>${message}</p>
                 <p>Sent at ${new Date().toLocaleTimeString()}</p>`,
        }),
      }).catch(() => {})
    }
  }

  return { ok: true }
}

export async function resolveVolunteerAlert(alertId: string) {
  const admin = createAdminClient()
  await admin
    .from('volunteer_alerts')
    .update({ resolved: true, resolved_at: new Date().toISOString() })
    .eq('id', alertId)
  return { ok: true }
}

export async function signupAsVolunteer(
  eventId: string,
  name: string,
  email: string,
  phone: string | null,
  role: string,
  notes: string | null
) {
  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('volunteers')
    .select('id')
    .eq('event_id', eventId)
    .eq('email', email.toLowerCase())
    .maybeSingle()

  if (existing) return { error: 'You have already applied to volunteer for this event.' }

  const { nanoid } = await import('nanoid')
  const token = nanoid(32)

  const { error } = await admin.from('volunteers').insert({
    event_id: eventId,
    name: name.trim(),
    email: email.toLowerCase().trim(),
    phone: phone?.trim() ?? null,
    role,
    notes,
    status: 'pending',
    portal_access_token: token,
    assigned_sessions: [],
  })

  if (error) return { error: error.message }

  const { data: event } = await admin
    .from('events')
    .select('title, organizations(name)')
    .eq('id', eventId)
    .single()

  const orgName = (event as any)?.organizations?.name ?? 'Event organizer'
  const eventTitle = (event as any)?.title ?? 'the event'

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${orgName} <noreply@prezva.app>`,
      to: email,
      subject: `Volunteer application received — ${eventTitle}`,
      html: `<p>Hi ${name},</p>
             <p>Thanks for applying to volunteer at <strong>${eventTitle}</strong>!</p>
             <p>The organizer will review your application and send you a portal link with your assignment details.</p>
             <p>— ${orgName}</p>`,
    }),
  }).catch(() => {})

  return { ok: true }
}

export async function exportVolunteerHours(eventId: string) {
  const supabase = await createClient()
  const user = await requireUser()

  const { data: event } = await supabase
    .from('events')
    .select('org_id, title')
    .eq('id', eventId)
    .single()

  if (!event) return { error: 'Event not found' }

  await assertOrgRole(supabase, (event as any).org_id, user.id, ['owner', 'admin', 'staff'])

  const admin = createAdminClient()
  const { data: volunteers } = await admin
    .from('volunteers')
    .select('name, email, phone, role, shift_start, shift_end, clocked_in_at, clocked_out_at, status, notes')
    .eq('event_id', eventId)
    .order('name', { ascending: true })

  const rows = ((volunteers ?? []) as any[]).map(v => {
    const clockedIn = v.clocked_in_at ? new Date(v.clocked_in_at) : null
    const clockedOut = v.clocked_out_at ? new Date(v.clocked_out_at) : null
    const hoursWorked = clockedIn && clockedOut
      ? ((clockedOut.getTime() - clockedIn.getTime()) / 3600000).toFixed(2)
      : ''

    return [
      v.name ?? '',
      v.email ?? '',
      v.phone ?? '',
      v.role ?? '',
      v.status ?? '',
      v.shift_start ? new Date(v.shift_start).toLocaleString() : '',
      v.shift_end ? new Date(v.shift_end).toLocaleString() : '',
      v.clocked_in_at ? new Date(v.clocked_in_at).toLocaleString() : '',
      v.clocked_out_at ? new Date(v.clocked_out_at).toLocaleString() : '',
      hoursWorked,
      v.notes ?? '',
    ].map(cell => `"${String(cell).replace(/"/g, '""')}"`)
     .join(',')
  })

  const header = '"Name","Email","Phone","Role","Status","Shift Start","Shift End","Clocked In","Clocked Out","Hours Worked","Notes"'
  const csv = [header, ...rows].join('\n')

  return { ok: true, csv, filename: `volunteers-${(event as any).title?.toLowerCase().replace(/\s+/g, '-')}.csv` }
}

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
        from: `${orgName} <noreply@prezva.app>`,
        to: vol.email,
        subject: `Thank you for volunteering at ${eventTitle}!`,
        html: `<p>Hi ${vol.name},</p>
               <p>Thank you for volunteering at <strong>${eventTitle}</strong>!</p>
               ${hours ? `<p>You contributed <strong>${hours} hours</strong> as ${vol.role}. That makes a real difference.</p>` : ''}
               <p>We truly appreciate your time and dedication.</p>
               ${surveyUrl ? `<p><a href="${surveyUrl}" style="display:inline-block;padding:10px 20px;background:#00BFA6;color:#0D1B2A;text-decoration:none;border-radius:6px;font-weight:700">Share your feedback →</a></p>` : ''}
               <p>— ${orgName}</p>`,
      }),
    }).catch(() => {})
  }
}
