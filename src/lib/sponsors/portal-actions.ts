'use server'
import { createAdminClient } from '@/lib/supabase/admin'

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

  // NOTE: Lead scanning (sponsor_leads table) ships in Bundle 10 (B10-6).
  // Until then, return empty leads — do NOT expose full attendee list to sponsors.
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
    leads: [] as { id: string; attendee_name: string; attendee_email: string; attendee_company: string | null; created_at: string }[],
  }
}

export async function exportSponsorLeads(eventSlug: string, token: string): Promise<{ csv?: string; error?: string }> {
  const admin = createAdminClient()

  const { data: event } = await admin.from('events').select('id, title').eq('slug', eventSlug).maybeSingle()
  if (!event) return { error: 'Event not found' }

  const { data: sponsor } = await admin
    .from('event_sponsors')
    .select('id, name, portal_access_token')
    .eq('event_id', event.id)
    .eq('portal_access_token', token)
    .maybeSingle()
  if (!sponsor) return { error: 'Invalid portal link' }

  // NOTE: Lead scanning ships in Bundle 10 (B10-6). Until then, CSV export is unavailable.
  // This prevents sponsors from accessing full event attendee data without explicit opt-in scan.
  return { error: 'Lead export will be available once lead scanning is set up for your booth.' }
}
