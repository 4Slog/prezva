'use server'
import { createAdminClient } from '@/lib/supabase/admin'

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
