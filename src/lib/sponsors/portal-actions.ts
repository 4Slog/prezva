'use server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { assertOrgRole } from '@/lib/orgs/actions'

async function validateToken(token: string) {
  const admin = createAdminClient()
  const { data: sponsor } = await admin
    .from('event_sponsors')
    .select('id, event_id, name, portal_access_token')
    .eq('portal_access_token', token)
    .maybeSingle()
  return sponsor ?? null
}

export async function getSponsorPortalData(eventSlug: string, sponsorSlug: string, token: string) {
  const admin = createAdminClient()

  const { data: event } = await admin
    .from('events')
    .select('id, title, slug, starts_at, ends_at, status')
    .eq('slug', eventSlug)
    .maybeSingle()

  if (!event) return { error: 'Event not found' }

  const { data: sponsor } = await admin
    .from('event_sponsors')
    .select('id, name, slug, tier, logo_url, website_url, description, contact_email, materials, portal_access_token')
    .eq('event_id', event.id)
    .eq('portal_access_token', token)
    .maybeSingle()

  if (!sponsor) return { error: 'Invalid portal link' }

  if ((sponsor as any).slug !== sponsorSlug && sponsorSlug !== (sponsor as any).id) {
    return { error: 'Invalid portal link' }
  }

  const { data: leads } = await admin
    .from('sponsor_leads')
    .select('id, attendee_name, attendee_email, company, job_title, note, quality, scanned_by_contact_name, created_at')
    .eq('sponsor_id', (sponsor as any).id)
    .order('created_at', { ascending: false })

  return {
    event: { id: event.id, title: event.title, starts_at: event.starts_at, ends_at: event.ends_at },
    sponsor: {
      id: (sponsor as any).id,
      name: (sponsor as any).name,
      tier: (sponsor as any).tier,
      logo_url: (sponsor as any).logo_url,
      website_url: (sponsor as any).website_url,
      description: (sponsor as any).description,
      contact_email: (sponsor as any).contact_email,
      materials: (sponsor as any).materials ?? [],
    },
    leads: (leads ?? []) as SponsorLead[],
  }
}

export interface SponsorLead {
  id: string
  attendee_name: string | null
  attendee_email: string | null
  company: string | null
  job_title: string | null
  note: string | null
  quality: 'hot' | 'warm' | 'cold'
  scanned_by_contact_name: string | null
  created_at: string
}

export async function scanLead(
  token: string,
  qrCode: string,
  note?: string,
  contactName?: string,
): Promise<{ ok?: boolean; attendee_name?: string; company?: string | null; job_title?: string | null; error?: string }> {
  const admin = createAdminClient()
  const sponsor = await validateToken(token)
  if (!sponsor) return { error: 'Invalid portal token' }

  const { data: reg } = await admin
    .from('registrations')
    .select('id, attendee_name, attendee_email, event_id')
    .eq('qr_code', qrCode)
    .eq('event_id', sponsor.event_id)
    .maybeSingle()

  if (!reg) return { error: 'QR code not recognized' }

  const { error } = await admin.from('sponsor_leads').insert({
    event_id: sponsor.event_id,
    sponsor_id: sponsor.id,
    registration_id: (reg as any).id,
    attendee_name: (reg as any).attendee_name,
    attendee_email: (reg as any).attendee_email,
    note: note ?? null,
    scanned_by_contact_name: contactName ?? null,
  })

  if (error) return { error: error.message }
  return {
    ok: true,
    attendee_name: (reg as any).attendee_name,
    company: null,
    job_title: null,
  }
}

export async function getLeads(token: string): Promise<SponsorLead[]> {
  const admin = createAdminClient()
  const sponsor = await validateToken(token)
  if (!sponsor) return []
  const { data } = await admin
    .from('sponsor_leads')
    .select('id, attendee_name, attendee_email, company, job_title, note, quality, scanned_by_contact_name, created_at')
    .eq('sponsor_id', sponsor.id)
    .order('created_at', { ascending: false })
  return (data ?? []) as SponsorLead[]
}

export async function exportSponsorLeads(eventSlug: string, token: string): Promise<{ csv?: string; error?: string }> {
  const admin = createAdminClient()
  const { data: event } = await admin.from('events').select('id').eq('slug', eventSlug).maybeSingle()
  if (!event) return { error: 'Event not found' }
  const { data: sponsor } = await admin
    .from('event_sponsors')
    .select('id')
    .eq('event_id', event.id)
    .eq('portal_access_token', token)
    .maybeSingle()
  if (!sponsor) return { error: 'Invalid portal link' }
  const { data: leads } = await admin
    .from('sponsor_leads')
    .select('attendee_name, attendee_email, company, job_title, note, quality, created_at')
    .eq('sponsor_id', (sponsor as any).id)
    .order('created_at', { ascending: false })
  if (!leads?.length) return { csv: 'name,email,company,job_title,note,quality,scanned_at\n' }
  const rows = leads.map((l: any) =>
    [l.attendee_name, l.attendee_email, l.company, l.job_title, l.note, l.quality, l.created_at]
      .map(v => JSON.stringify(v ?? '')).join(',')
  )
  return { csv: 'name,email,company,job_title,note,quality,scanned_at\n' + rows.join('\n') }
}

export async function updateLeadQuality(
  token: string,
  leadId: string,
  quality: 'hot' | 'warm' | 'cold',
): Promise<{ ok?: boolean; error?: string }> {
  const admin = createAdminClient()
  const sponsor = await validateToken(token)
  if (!sponsor) return { error: 'Invalid portal token' }
  const { error } = await admin
    .from('sponsor_leads')
    .update({ quality })
    .eq('id', leadId)
    .eq('sponsor_id', sponsor.id)
  if (error) return { error: error.message }
  return { ok: true }
}

export async function addSponsorContact(
  sponsorId: string,
  name: string,
  email?: string,
): Promise<{ id?: string; portal_token?: string; error?: string }> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('sponsor_contacts')
    .insert({ sponsor_id: sponsorId, name, email: email ?? null })
    .select('id, portal_token')
    .single()
  if (error) return { error: error.message }
  return { id: (data as any).id, portal_token: (data as any).portal_token }
}

export async function getSponsorContacts(sponsorId: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('sponsor_contacts')
    .select('id, name, email, portal_token, created_at')
    .eq('sponsor_id', sponsorId)
    .order('created_at', { ascending: true })
  return data ?? []
}

export async function getSponsorByContactToken(contactToken: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('sponsor_contacts')
    .select('*, event_sponsors(*)')
    .eq('portal_token', contactToken)
    .maybeSingle()
  return data
}

export async function sendSponsorPortalInvite(sponsorId: string) {
  const supabase = await createClient()
  const user = await requireUser()
  const admin = createAdminClient()

  const { data: sponsor } = await admin
    .from('event_sponsors')
    .select('id, name, slug, contact_email, portal_access_token, event_id, events(title, slug, org_id, organizations(name))')
    .eq('id', sponsorId)
    .single()

  if (!sponsor) return { error: 'Sponsor not found' }

  const orgId = (sponsor as any).events?.org_id
  await assertOrgRole(supabase, orgId, user.id, ['owner', 'admin', 'staff'])

  const email = (sponsor as any).contact_email
  if (!email) return { error: 'No contact email set for this sponsor. Add one in sponsor settings first.' }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://prezva.app'
  const eventSlug = (sponsor as any).events?.slug
  const sponsorSlug = (sponsor as any).slug ?? (sponsor as any).id
  const portalUrl = `${appUrl}/sponsor-portal/${eventSlug}/${sponsorSlug}?token=${(sponsor as any).portal_access_token}`
  const orgName = (sponsor as any).events?.organizations?.name ?? 'Event organizer'
  const eventTitle = (sponsor as any).events?.title ?? 'the event'

  const result = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${orgName} <noreply@prezva.app>`,
      to: email,
      subject: `Your sponsor portal is ready — ${eventTitle}`,
      html: `<p>Hi ${(sponsor as any).name} team,</p>
             <p>Your sponsor portal for <strong>${eventTitle}</strong> is ready.</p>
             <p>Use your portal to:</p>
             <ul>
               <li>Scan attendee badges to capture leads</li>
               <li>Rate and add notes to leads</li>
               <li>Export your lead list as CSV</li>
               <li>View event materials</li>
             </ul>
             <p><a href="${portalUrl}" style="display:inline-block;padding:12px 24px;background:#00BFA6;color:#0D1B2A;text-decoration:none;border-radius:6px;font-weight:700">Open sponsor portal →</a></p>
             <p>Keep this link private — it provides direct access to your portal.</p>
             <p>— ${orgName}</p>`,
    }),
  })

  if (!result.ok) return { error: 'Failed to send email' }
  return { ok: true }
}
