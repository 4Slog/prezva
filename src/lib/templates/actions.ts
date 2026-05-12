'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { TemplateSurface, OrgTemplate } from './types'

export async function getOrgTemplates(orgId: string, surface: TemplateSurface): Promise<OrgTemplate[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('org_templates')
    .select('*')
    .eq('org_id', orgId)
    .eq('surface', surface)
    .order('usage_count', { ascending: false })
  return (data ?? []) as OrgTemplate[]
}

export async function saveAsTemplate(
  orgId: string,
  surface: TemplateSurface,
  name: string,
  payload: Record<string, unknown>,
  description?: string
): Promise<{ data?: OrgTemplate; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Verify org membership
  const { data: member } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .single()

  if (!member || !['owner', 'admin'].includes((member as { role: string }).role)) {
    return { error: 'Only org admins can save templates' }
  }

  const { data, error } = await supabase
    .from('org_templates')
    .insert({ org_id: orgId, surface, name, description, payload, created_by: user.id })
    .select('*')
    .single()

  if (error) return { error: error.message }
  return { data: data as OrgTemplate }
}

export async function incrementTemplateUsage(templateId: string): Promise<void> {
  // Admin client: increment usage_count bypassing RLS restrictions
  const admin = createAdminClient()
  try {
    await admin.rpc('increment_template_usage', { template_id: templateId })
  } catch {
    // Non-critical — fail silently if RPC not yet created
  }
}

export async function deleteOrgTemplate(templateId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('org_templates').delete().eq('id', templateId)
  if (error) return { error: error.message }
  return {}
}

export async function listOrgTemplates(orgId: string): Promise<OrgTemplate[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('org_templates')
    .select('*')
    .eq('org_id', orgId)
    .order('surface', { ascending: true })
    .order('created_at', { ascending: false })
  return (data ?? []) as OrgTemplate[]
}
