import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/get-user'
import { seedBuiltinRoles } from '@/lib/orgs/seed-builtin-roles'
import { z } from 'zod'

const Schema = z.object({
  name: z.string().min(2).max(80),
  slug: z.string().min(2).max(40).regex(/^[a-z0-9-]+$/),
  timezone: z.string().min(1).default('America/Chicago'),
  invite_code: z.string().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser()
    // Admin client: org + first owner member require service role (chicken-and-egg RLS).
    // Matches the pattern in src/lib/orgs/actions.ts createOrg().
    const admin = createAdminClient()
    const body = await req.json()
    const parsed = Schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    // Gate first-org creation behind an invite code; existing owners are exempt.
    // Mirrors the gate in src/lib/orgs/actions.ts createOrg().
    const { count: ownerCount } = await admin
      .from('org_members')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('role', 'owner')
    let inviteToConsume: string | null = null
    if (!ownerCount || ownerCount === 0) {
      const code = parsed.data.invite_code?.trim().toUpperCase()
      if (!code) return NextResponse.json({ error: 'An invite code is required to create your first organization.' }, { status: 403 })
      const { data: invite } = await admin.from('invite_codes').select('id, email, used_at').eq('code', code).maybeSingle()
      if (!invite) return NextResponse.json({ error: 'Invalid invite code. Please check your code and try again.' }, { status: 403 })
      if (invite.used_at) return NextResponse.json({ error: 'This invite code has already been used.' }, { status: 403 })
      if (invite.email && invite.email.toLowerCase() !== user.email?.toLowerCase()) return NextResponse.json({ error: 'This invite code is not valid for this email address.' }, { status: 403 })
      inviteToConsume = invite.id
    }

    const { data: existing } = await admin
      .from('organizations')
      .select('id')
      .eq('slug', parsed.data.slug)
      .maybeSingle()
    if (existing) {
      return NextResponse.json({ error: 'Slug already taken' }, { status: 409 })
    }

    const { data: org, error: orgErr } = await admin
      .from('organizations')
      .insert({ ...parsed.data, created_by: user.id })
      .select()
      .single()
    if (orgErr || !org) {
      if ((orgErr as { code?: string } | null)?.code === '23505') {
        return NextResponse.json({ error: 'Slug already taken' }, { status: 409 })
      }
      return NextResponse.json({ error: orgErr?.message ?? 'Failed' }, { status: 500 })
    }

    // Seed built-in roles and get owner role_id before inserting the member row.
    // No DB transaction available — if seeding fails, the org exists but has no
    // roles (same as the pre-fix bug). Return a clear error instead of silently
    // redirecting to a broken org.
    let ownerRoleId: string
    try {
      ownerRoleId = await seedBuiltinRoles(org.id, admin)
    } catch (e) {
      console.error('[POST /api/orgs] seedBuiltinRoles failed:', e)
      return NextResponse.json({ error: 'Organization created but role setup failed. Please contact support.' }, { status: 500 })
    }

    const { error: memberErr } = await admin.from('org_members').insert({
      org_id: org.id,
      user_id: user.id,
      role: 'owner',
      role_id: ownerRoleId,
      invited_by: user.id,
    })
    if (memberErr) {
      return NextResponse.json({ error: memberErr.message }, { status: 500 })
    }

    if (inviteToConsume) {
      await admin.from('invite_codes').update({ used_at: new Date().toISOString(), used_by: user.id }).eq('id', inviteToConsume)
    }

    return NextResponse.json(org, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function GET() {
  try {
    const user = await requireUser()
    // Admin client: org_members RLS can miss new OAuth users before profile creates
    const { createAdminClient } = await import("@/lib/supabase/admin")
    const admin = createAdminClient()

    const { data, error } = await admin
      .from("org_members")
      .select("org_id, role, organizations(id, name, slug, logo_url, timezone)")
      .eq("user_id", user.id)
      .order("joined_at", { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}
