'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/get-user'
import { logAudit } from '@/lib/audit/log'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { randomBytes } from 'crypto'

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

export async function assertOrgRole(
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

  // Admin client: org + first owner member require service role (chicken-and-egg RLS)
  const admin = createAdminClient()

  const { data: org, error: orgErr } = await admin
    .from('organizations')
    .insert({
      name: parsed.data.name,
      slug: parsed.data.slug,
      timezone: parsed.data.timezone,
      created_by: user.id,
    })
    .select()
    .single()

  if (orgErr || !org) {
    if ((orgErr as any)?.code === '23505') {
      return { error: 'That URL is already taken. Please choose a different one.', field: 'slug' }
    }
    return { error: orgErr?.message ?? 'Failed to create organization' }
  }

  // Add creator as owner
  const { error: memberErr } = await admin.from('org_members').insert({
    org_id: org.id,
    user_id: user.id,
    role: 'owner',
    invited_by: user.id,
  })
  if (memberErr) return { error: memberErr.message }

  await logAudit(supabase, org.id, user.id, 'org.create', 'organization', org.id)
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

  const { data: org } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', orgId)
    .maybeSingle()

  const token = randomBytes(24).toString('hex')

  const { error: inviteError } = await supabase
    .from('org_member_invites')
    .insert({
      org_id: orgId,
      email: parsed.data.email.toLowerCase(),
      role: parsed.data.role,
      token,
      invited_by: user.id,
    })

  if (inviteError) return { error: inviteError.message }

  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${token}`
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#0D1B2A;padding:24px;border-radius:12px 12px 0 0;">
        <h1 style="color:#00BFA6;margin:0;font-size:1.5rem;">You're invited!</h1>
      </div>
      <div style="background:#112240;padding:24px;border-radius:0 0 12px 12px;color:#F0F4F8;">
        <p>You've been invited to join <strong>${org?.name ?? 'an organization'}</strong> on Prezva as <strong>${parsed.data.role}</strong>.</p>
        <div style="margin:24px 0;text-align:center;">
          <a href="${inviteUrl}" style="background:#00BFA6;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:1rem;">Accept Invitation</a>
        </div>
        <p style="color:#94A3B8;font-size:0.875rem;">This invitation expires in 7 days. If you didn't expect this, you can ignore it.</p>
        <p style="color:#64748B;font-size:0.75rem;word-break:break-all;">${inviteUrl}</p>
      </div>
    </div>
  `

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Prezva <noreply@prezva.app>',
      to: parsed.data.email,
      subject: `You're invited to join ${org?.name ?? 'an organization'} on Prezva`,
      html,
    }),
  })

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

export async function acceptInvite(token: string) {
  const user = await requireUser()
  const supabase = await createClient()

  const { createClient: createServiceClient } = await import('@supabase/supabase-js')
  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: invite } = await service
    .from('org_member_invites')
    .select('*')
    .eq('token', token)
    .maybeSingle()

  if (!invite) return { error: 'Invite not found or already used' }
  if (invite.accepted_at) return { error: 'This invitation has already been accepted' }
  if (new Date(invite.expires_at) < new Date()) return { error: 'This invitation has expired' }

  // Get user email to verify it matches
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (authUser?.email?.toLowerCase() !== invite.email.toLowerCase()) {
    return { error: `This invitation was sent to ${invite.email} — please sign in with that account` }
  }

  const { error: memberError } = await service.from('org_members').insert({
    org_id: invite.org_id,
    user_id: user.id,
    role: invite.role,
    invited_by: invite.invited_by,
  })

  if (memberError && memberError.code !== '23505') return { error: memberError.message }

  await service
    .from('org_member_invites')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', invite.id)

  revalidatePath('/dashboard')
  return { success: true, orgId: invite.org_id }
}

// ── Get org with membership check ────────────────────────────────────────────

export async function getOrgBySlug(slug: string) {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: org, error } = await supabase
    .from('organizations')
    .select(`
      *,
      org_members!inner(user_id, role)
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
  // Admin client: avoids RLS lag for new OAuth users
  const admin = createAdminClient()

  const { data, error } = await admin
    .from("org_members")
    .select("org_id, role, organizations(id, name, slug, logo_url, timezone)")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: true })

  if (error) return []
  return data ?? []
}
