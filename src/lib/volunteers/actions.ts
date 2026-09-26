'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { assertPermission } from '@/lib/auth/assert-permission'
import { catchPermission } from '@/lib/auth/permission-error'
import { escapeHtml, safeDisplayName, safeSubject } from '@/lib/email/escape'

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

  // O158: the response was written blind; a failed write now reports failure
  // instead of telling the volunteer (and the organizer) it was saved.
  const { error: saveError } = await admin.from('volunteers').update({
    shift_response: response,
    shift_response_at: new Date().toISOString(),
    shift_decline_reason: declineReason ?? null,
  }).eq('id', (vol as any).id)
  if (saveError) {
    console.error('[volunteers] shift response write failed', saveError.message)
    return { error: 'Could not save your response. Please try again.' }
  }

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
        subject: safeSubject(`Volunteer ${response}: ${(vol as any).name} — ${eventTitle}`),
        html: `<p>${escapeHtml((vol as any).name ?? '')} has <strong>${response}</strong> their volunteer shift for ${escapeHtml(eventTitle)}.</p>
               ${declineReason ? `<p>Reason: ${escapeHtml(declineReason)}</p>` : ''}`,
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
          subject: safeSubject(`URGENT: ${(vol as any).name} — ${(vol as any).events?.title}`),
          html: `<p><strong>Urgent alert from volunteer ${escapeHtml((vol as any).name ?? '')}:</strong></p>
                 <p>${escapeHtml(message)}</p>
                 <p>Sent at ${new Date().toLocaleTimeString()}</p>`,
        }),
      }).catch(() => {})
    }
  }

  return { ok: true }
}

export async function resolveVolunteerAlert(alertId: string) {
  const user = await requireUser()
  const admin = createAdminClient()
  const { data: alert } = await admin.from('volunteer_alerts').select('id, event_id').eq('id', alertId).maybeSingle()
  if (!alert) return { error: 'Alert not found' }
  const { data: event } = await admin.from('events').select('org_id').eq('id', alert.event_id).maybeSingle()
  if (!event) return { error: 'Event not found' }
  try { await assertPermission(event.org_id as string, user.id, 'volunteers.manage') } catch (e) { return catchPermission(e) }
  const { data, error } = await admin
    .from('volunteer_alerts')
    .update({ resolved: true, resolved_at: new Date().toISOString() })
    .eq('id', alertId)
    .eq('event_id', alert.event_id)
    .select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Alert not found' }
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
      from: `${safeDisplayName(orgName)} <noreply@prezva.app>`,
      to: email,
      subject: safeSubject(`Volunteer application received — ${eventTitle}`),
      html: `<p>Hi ${escapeHtml(name)},</p>
             <p>Thanks for applying to volunteer at <strong>${escapeHtml(eventTitle)}</strong>!</p>
             <p>The organizer will review your application and send you a portal link with your assignment details.</p>
             <p>— ${escapeHtml(orgName)}</p>`,
    }),
  }).catch(() => {})

  return { ok: true }
}

export async function exportVolunteerHours(eventId: string) {
  const supabase = await createClient()
  const user = await requireUser()

  const { data: event } = await supabase
    .from('events')
    .select('org_id, title, timezone')
    .eq('id', eventId)
    .single()

  if (!event) return { error: 'Event not found' }

  try { await assertPermission((event as any).org_id, user.id, 'volunteers.manage') } catch (e) { return catchPermission(e) }

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
      v.shift_start ? new Date(v.shift_start).toLocaleString('en-US', { timeZone: (event as any).timezone ?? 'UTC', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '',
      v.shift_end ? new Date(v.shift_end).toLocaleString('en-US', { timeZone: (event as any).timezone ?? 'UTC', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '',
      v.clocked_in_at ? new Date(v.clocked_in_at).toLocaleString('en-US', { timeZone: (event as any).timezone ?? 'UTC', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '',
      v.clocked_out_at ? new Date(v.clocked_out_at).toLocaleString('en-US', { timeZone: (event as any).timezone ?? 'UTC', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '',
      hoursWorked,
      v.notes ?? '',
    ].map(cell => `"${String(cell).replace(/"/g, '""')}"`)
     .join(',')
  })

  const header = '"Name","Email","Phone","Role","Status","Shift Start","Shift End","Clocked In","Clocked Out","Hours Worked","Notes"'
  const csv = [header, ...rows].join('\n')

  return { ok: true, csv, filename: `volunteers-${(event as any).title?.toLowerCase().replace(/\s+/g, '-')}.csv` }
}

