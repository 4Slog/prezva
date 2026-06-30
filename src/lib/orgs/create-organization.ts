import { createAdminClient } from '@/lib/supabase/admin'
import { seedBuiltinRoles } from './seed-builtin-roles'
import { logAudit } from '@/lib/audit/log'
import type { Organization } from '@/types/database'

export type CreateOrgInput = {
  userId: string
  userEmail: string | null
  name: string
  slug: string
  timezone: string
  inviteCode?: string | null
}

export type CreateOrgResult =
  | { ok: true; org: Organization }
  | { ok: false; status: number; error: string; field?: 'slug' }

export async function createOrganization(input: CreateOrgInput): Promise<CreateOrgResult> {
  const { userId, userEmail, name, slug, timezone } = input
  const admin = createAdminClient()

  // Slug uniqueness first (cheap, side-effect-free — before claiming any code).
  const { data: existing } = await admin
    .from('organizations').select('id').eq('slug', slug).maybeSingle()
  if (existing) return { ok: false, status: 409, error: 'That URL is already taken. Please choose a different one.', field: 'slug' }

  // Gate: first org requires an invite code; existing owners exempt.
  const { count: ownerCount } = await admin
    .from('org_members').select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('role', 'owner')

  let claimedInviteId: string | null = null
  if (!ownerCount || ownerCount === 0) {
    const code = input.inviteCode?.trim().toUpperCase()
    if (!code) return { ok: false, status: 403, error: 'An invite code is required to create your first organization.' }
    // Pre-read for specific messaging (advisory only — authority is the atomic claim below).
    const { data: invite } = await admin
      .from('invite_codes').select('id, email, used_at').eq('code', code).maybeSingle()
    if (!invite) return { ok: false, status: 403, error: 'Invalid invite code. Please check your code and try again.' }
    if (invite.used_at) return { ok: false, status: 403, error: 'This invite code has already been used.' }
    if (invite.email && invite.email.toLowerCase() !== (userEmail ?? '').toLowerCase())
      return { ok: false, status: 403, error: 'This invite code is not valid for this email address.' }
    // Atomic claim: only one concurrent caller can flip used_at from NULL.
    const { data: claimed } = await admin
      .from('invite_codes')
      .update({ used_at: new Date().toISOString(), used_by: userId })
      .eq('code', code).is('used_at', null)
      .select('id').maybeSingle()
    if (!claimed) return { ok: false, status: 403, error: 'This invite code is no longer available.' }
    claimedInviteId = claimed.id
  }

  // Best-effort release of a claimed code on any downstream failure.
  const release = async () => {
    if (!claimedInviteId) return
    try { await admin.from('invite_codes').update({ used_at: null, used_by: null }).eq('id', claimedInviteId) } catch {}
  }

  // Create org — EXPLICIT columns (never spread untrusted parsed input).
  const { data: org, error: orgErr } = await admin
    .from('organizations').insert({ name, slug, timezone, created_by: userId }).select().single()
  if (orgErr || !org) {
    await release()
    if ((orgErr as { code?: string } | null)?.code === '23505')
      return { ok: false, status: 409, error: 'That URL is already taken. Please choose a different one.', field: 'slug' }
    return { ok: false, status: 500, error: orgErr?.message ?? 'Failed to create organization' }
  }

  // Seed built-in roles (no DB transaction available — release code if this fails).
  let ownerRoleId: string
  try { ownerRoleId = await seedBuiltinRoles(org.id, admin) }
  catch (e) {
    console.error('[createOrganization] seedBuiltinRoles failed:', e)
    await release()
    return { ok: false, status: 500, error: 'Organization created but role setup failed. Please contact support.' }
  }

  // Owner membership (dual-write role enum + role_id).
  const { error: memberErr } = await admin.from('org_members').insert({
    org_id: org.id, user_id: userId, role: 'owner', role_id: ownerRoleId, invited_by: userId,
  })
  if (memberErr) { await release(); return { ok: false, status: 500, error: memberErr.message } }

  // Audit once here so BOTH entry points are covered (silent on failure).
  await logAudit(admin, org.id, userId, 'org.create', 'organization', org.id)
  return { ok: true, org: org as Organization }
}
