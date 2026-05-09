'use server'

import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

// ── Validation schemas ───────────────────────────────────────────────────────

const CreateOrgSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, 'Slug may only contain lowercase letters, numbers, and hyphens'),
  timezone: z.string().min(1).default('America/Chicago'),
})

const UpdateOrgSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  timezone: z.string().min(1).optional(),
  logo_url: z.string().url().nullable().optional(),
})

const InviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'staff']),
})

// ── Helper: assert caller is owner or admin ──────────────────────────────────

async function assertOrgRole(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  userId: string,
  allowedRoles: ('owner' | 'admin' | 'staff')[] = ['owner', 'admin'],
) {
  const { data, error } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error || !data) throw new Error('Not a member of this organization')
  if (!allowedRoles.includes(data.role as 'owner' | 'admin' | 'staff'))
    throw new Error('Insufficient permissions')

  return data.role as 'owner' | 'admin' | 'staff'
}

// ── Create org ───────────────────────────────────────────────────────────────

export async function createOrg(formData: FormData) {
  const user = await requireUser()
  const supabase = await createClient()

  const parsed = CreateOrgSchema.safeParse({
    name: formData.get('name'),
    slug: formData.get('slug'),
    timezone: formData.get('timezone') ?? 'America/Chicago',
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  // Check slug uniqueness
  const { data: existing } = await supabase
    .from('organizations')
    .select('id')
    .eq('slug', parsed.data.slug)
    .maybeSingle()
  if (existing) return { error: 'That slug is already taken — choose another' }

  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .insert({
      name: parsed.data.name,
      slug: parsed.data.slug,
      timezone: parsed.data.timezone,
      created_by: user.id,
    })
    .select()
    .single()

  if (orgErr || !org) return { error: orgErr?.message ?? 'Failed to create organization' }

  // Add creator as owner
  const { error: memberErr } = await supabase.from('org_members').insert({
    org_id: org.id,
    user_id: user.id,
    role: 'owner',
    invited_by: user.id,
    accepted_at: new Date().toISOString(),
  })
  if (memberErr) return { error: memberErr.message }

  revalidatePath('/dashboard')
  redirect(`/orgs/${org.slug}/settings`)
}

// ── Update org ───────────────────────────────────────────────────────────────

export async function updateOrg(orgId: string, formData: FormData) {
  const user = await requireUser()
  const supabase = await createClient()

  await assertOrgRole(supabase, orgId, user.id, ['owner', 'admin'])

  const parsed = UpdateOrgSchema.safeParse({
    name: formData.get('name') || undefined,
    timezone: formData.get('timezone') || undefined,
    logo_url: formData.get('logo_url') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { error } = await supabase
    .from('organizations')
    .update(parsed.data)
    .eq('id', orgId)

  if (error) return { error: error.message }

  revalidatePath('/dashboard')
  revalidatePath(`/orgs/[slug]`)
  return { success: true }
}

// ── Invite member ────────────────────────────────────────────────────────────

export async function inviteMember(orgId: string, formData: FormData) {
  const user = await requireUser()
  const supabase = await createClient()

  await assertOrgRole(supabase, orgId, user.id, ['owner', 'admin'])

  const parsed = InviteSchema.safeParse({
    email: formData.get('email'),
    role: formData.get('role'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  // Look up target user by email
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', parsed.data.email)
    .maybeSingle()

  if (!profile) return { error: 'No Prezva account found for that email address' }

  // Already a member?
  const { data: existing } = await supabase
    .from('org_members')
    .select('id')
    .eq('org_id', orgId)
    .eq('user_id', profile.id)
    .maybeSingle()
  if (existing) return { error: 'That person is already a member of this organization' }

  const { error } = await supabase.from('org_members').insert({
    org_id: orgId,
    user_id: profile.id,
    role: parsed.data.role,
    invited_by: user.id,
    // accepted_at null = pending invite
  })

  if (error) return { error: error.message }

  revalidatePath(`/orgs/[slug]`)
  return { success: true }
}

// ── Remove member ────────────────────────────────────────────────────────────

export async function removeMember(orgId: string, memberId: string) {
  const user = await requireUser()
  const supabase = await createClient()

  await assertOrgRole(supabase, orgId, user.id, ['owner', 'admin'])

  // Cannot remove yourself if owner
  const { data: self } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (self?.role === 'owner' && memberId === user.id) {
    return { error: 'Owners cannot remove themselves — transfer ownership first' }
  }

  const { error } = await supabase
    .from('org_members')
    .delete()
    .eq('org_id', orgId)
    .eq('user_id', memberId)

  if (error) return { error: error.message }

  revalidatePath(`/orgs/[slug]`)
  return { success: true }
}

// ── Accept invite ────────────────────────────────────────────────────────────

export async function acceptInvite(orgId: string) {
  const user = await requireUser()
  const supabase = await createClient()

  const { error } = await supabase
    .from('org_members')
    .update({ accepted_at: new Date().toISOString() })
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .is('accepted_at', null)

  if (error) return { error: error.message }

  revalidatePath('/dashboard')
  return { success: true }
}

// ── Get org with membership check ────────────────────────────────────────────

export async function getOrgBySlug(slug: string) {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: org, error } = await supabase
    .from('organizations')
    .select(`
      *,
      org_members!inner(user_id, role, accepted_at)
    `)
    .eq('slug', slug)
    .eq('org_members.user_id', user.id)
    .maybeSingle()

  if (error || !org) return null
  return org
}

// ── List user's orgs ─────────────────────────────────────────────────────────

export async function getUserOrgs() {
  const user = await requireUser()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('org_members')
    .select(`
      role,
      accepted_at,
      organizations(id, name, slug, logo_url, timezone)
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  if (error) return []
  return data
}
