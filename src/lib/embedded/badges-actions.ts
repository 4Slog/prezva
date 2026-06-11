'use server'

import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyEmbeddedSession, COOKIE_NAME } from '@/lib/embedded/session'
import type { BadgeTemplate } from '@/lib/templates/types'

// ── Embed context (session → location → org) ─────────────────────────────────

async function resolveEmbedContext() {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) throw new Error('No embed session')
  const session = await verifyEmbeddedSession(token)
  const db = createAdminClient()
  const { data: link } = await db
    .from('ghl_location_links')
    .select('org_id')
    .eq('ghl_location_id', session.location_id)
    .maybeSingle()
  if (!link) throw new Error('Location not linked to any organization')
  return { db, orgId: link.org_id }
}

async function assertEventOwnership(
  db: ReturnType<typeof createAdminClient>,
  eventId: string,
  orgId: string,
) {
  const { data } = await db
    .from('events')
    .select('id, org_id')
    .eq('id', eventId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!data) throw new Error('Event not found or access denied')
  return data
}

// ── Page data ──────────────────────────────────────────────────────────────────

export async function embedGetBadgePageData(eventId: string) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)

  const [eventResult, eventTemplatesResult, orgTemplatesResult, ticketTypesResult] = await Promise.all([
    db.from('events').select('id, title, org_id, badge_rules, slug').eq('id', eventId).single(),
    db.from('badge_templates').select('id, name, paper_size, is_template').eq('event_id', eventId),
    db.from('badge_templates').select('id, name, paper_size, template_json').eq('org_id', orgId).eq('is_template', true),
    db.from('ticket_types').select('id, name').eq('event_id', eventId).eq('is_active', true),
  ])

  return {
    orgId,
    eventSlug: (eventResult.data as any)?.slug ?? '',
    eventTemplates: (eventTemplatesResult.data ?? []) as any[],
    orgTemplates: (orgTemplatesResult.data ?? []) as any[],
    badgeRules: ((eventResult.data as any)?.badge_rules ?? []) as unknown[],
    ticketTypes: (ticketTypesResult.data ?? []) as any[],
  }
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export async function embedSaveAsOrgTemplate(templateId: string, orgId: string) {
  const { db, orgId: resolvedOrgId } = await resolveEmbedContext()
  if (orgId !== resolvedOrgId) return { error: 'Access denied' }

  // Verify the template belongs to this org before copying
  const { data: tpl } = await db
    .from('badge_templates')
    .select('*')
    .eq('id', templateId)
    .eq('org_id', resolvedOrgId)
    .maybeSingle()
  if (!tpl) return { error: 'Template not found' }

  const { error } = await db.from('badge_templates').insert({
    event_id: (tpl as any).event_id,
    org_id: resolvedOrgId,
    name: `${(tpl as any).name} (Template)`,
    paper_size: (tpl as any).paper_size,
    template_json: (tpl as any).template_json,
    is_template: true,
  })
  return { error: error?.message }
}

export async function embedUpdateBadgeRules(eventId: string, rules: unknown[]) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)

  const { error } = await db
    .from('events')
    .update({ badge_rules: rules })
    .eq('id', eventId)
  if (error) return { error: error.message }
  return { ok: true }
}

export async function embedCopyTemplateToEvent(
  templateId: string,
  eventId: string,
  orgId: string,
): Promise<{
  data: { id: string; name: string; paper_size: string; is_template?: boolean } | null
  error: string | null
}> {
  const { db, orgId: resolvedOrgId } = await resolveEmbedContext()
  if (orgId !== resolvedOrgId) return { data: null, error: 'Access denied' }
  await assertEventOwnership(db, eventId, resolvedOrgId)

  // Verify the source template belongs to this org
  const { data: tpl } = await db
    .from('badge_templates')
    .select('*')
    .eq('id', templateId)
    .eq('org_id', resolvedOrgId)
    .maybeSingle()
  if (!tpl) return { data: null, error: 'Template not found' }

  const { data: inserted, error } = await db
    .from('badge_templates')
    .insert({
      event_id: eventId,
      org_id: resolvedOrgId,
      name: (tpl as any).name,
      paper_size: (tpl as any).paper_size,
      template_json: (tpl as any).template_json,
      is_template: false,
    })
    .select('id, name, paper_size, is_template')
    .single()

  if (error) return { data: null, error: error.message }
  return { data: inserted as any, error: null }
}

export async function embedDeleteTemplate(templateId: string, eventId: string) {
  const { db, orgId } = await resolveEmbedContext()
  // assertEventOwnership ensures eventId belongs to this org
  await assertEventOwnership(db, eventId, orgId)

  // Double-check the template belongs to this org (admin client bypasses RLS)
  const { data: tpl } = await db
    .from('badge_templates')
    .select('id, org_id, event_id')
    .eq('id', templateId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!tpl) return { error: 'Template not found or access denied' }

  const { error } = await db.from('badge_templates').delete().eq('id', templateId)
  if (error) return { error: error.message }
  return { success: true }
}

export async function embedDeleteOrgTemplate(templateId: string) {
  const { db, orgId } = await resolveEmbedContext()

  // Filter by resolved org_id — admin client bypasses RLS so this check is mandatory
  const { data: tpl } = await db
    .from('badge_templates')
    .select('id, org_id')
    .eq('id', templateId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!tpl) return { error: 'Template not found or access denied' }

  const { error } = await db.from('badge_templates').delete().eq('id', templateId)
  if (error) return { error: error.message }
  return { success: true }
}

export async function embedCreateBadgeTemplate(
  eventId: string,
  tpl: BadgeTemplate,
): Promise<{ id?: string; error?: string }> {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)

  const { data, error } = await db
    .from('badge_templates')
    .insert({
      event_id: eventId,
      org_id: orgId,
      name: tpl.name,
      paper_size: `${tpl.size?.width_mm ?? 89}x${tpl.size?.height_mm ?? 102}mm`,
      template_json: tpl,
      is_template: false,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }
  return { id: (data as { id: string }).id }
}
