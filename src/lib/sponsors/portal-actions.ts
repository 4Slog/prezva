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
    .select('id, name, tier, logo_url, website_url, description, contact_email, materials, portal_access_token')
    .eq('event_id', event.id)
    .eq('portal_access_token', token)
    .maybeSingle()

  if (!sponsor) return { error: 'Invalid portal link' }

  if ((sponsor as any).slug !== sponsorSlug && sponsorSlug !== (sponsor as any).id) {
    return { error: 'Invalid portal link' }
  }

  const { data: registrations } = await admin
    .from('registrations')
    .select('id, attendee_name, attendee_email, attendee_company, created_at')
    .eq('event_id', event.id)
    .eq('status', 'confirmed')
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
    leads: (registrations ?? []) as { id: string; attendee_name: string; attendee_email: string; attendee_company: string | null; created_at: string }[],
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

  const { data: regs } = await admin
    .from('registrations')
    .select('attendee_name, attendee_email, attendee_company, attendee_phone, created_at')
    .eq('event_id', event.id)
    .eq('status', 'confirmed')
    .order('attendee_name')

  const rows = (regs ?? []) as any[]
  const header = 'Name,Email,Company,Phone,Registered At'
  const lines = rows.map(r =>
    [r.attendee_name, r.attendee_email, r.attendee_company ?? '', r.attendee_phone ?? '', new Date(r.created_at).toLocaleDateString()]
      .map(v => `"${String(v).replace(/"/g, '""')}"`)
      .join(',')
  )
  const csv = [header, ...lines].join('\n')
  return { csv }
}
