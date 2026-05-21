'use server'

import { createAdminClient } from '@/lib/supabase/admin'

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
