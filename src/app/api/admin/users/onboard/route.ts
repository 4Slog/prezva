import { requireAdmin } from '@/lib/admin/gate'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const schema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1).max(100),
  orgName: z.string().min(1).max(100),
  orgSlug: z.string().regex(/^[a-z0-9-]+$/).min(2).max(60),
})

export async function POST(req: NextRequest) {
  await requireAdmin()
  const admin = createAdminClient()

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  const { email, fullName, orgName, orgSlug } = parsed.data

  // Check slug uniqueness
  const { data: existing } = await admin
    .from('organizations')
    .select('id')
    .eq('slug', orgSlug)
    .single()

  if (existing) {
    return NextResponse.json({ error: `Slug "${orgSlug}" is already taken` }, { status: 409 })
  }

  // Create the organization
  const { data: org, error: orgErr } = await admin
    .from('organizations')
    .insert({ name: orgName, slug: orgSlug })
    .select('id')
    .single()

  if (orgErr || !org) {
    return NextResponse.json({ error: orgErr?.message ?? 'Failed to create organization' }, { status: 500 })
  }

  // Invite the user via Supabase auth (sends magic link email)
  const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName, org_id: org.id },
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/onboarding`,
  })

  if (inviteErr) {
    // Rollback org creation
    await admin.from('organizations').delete().eq('id', org.id)
    return NextResponse.json({ error: inviteErr.message }, { status: 500 })
  }

  return NextResponse.json({ orgId: org.id, email })
}
