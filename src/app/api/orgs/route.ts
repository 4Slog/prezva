import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { z } from 'zod'

const Schema = z.object({
  name: z.string().min(2).max(80),
  slug: z.string().min(2).max(40).regex(/^[a-z0-9-]+$/),
  timezone: z.string().min(1).default('America/Chicago'),
})

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser()
    const supabase = await createClient()
    const body = await req.json()
    const parsed = Schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const { data: existing } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', parsed.data.slug)
      .maybeSingle()
    if (existing) {
      return NextResponse.json({ error: 'Slug already taken' }, { status: 409 })
    }

    const { data: org, error: orgErr } = await supabase
      .from('organizations')
      .insert({ ...parsed.data, created_by: user.id })
      .select()
      .single()
    if (orgErr || !org) {
      return NextResponse.json({ error: orgErr?.message ?? 'Failed' }, { status: 500 })
    }

    await supabase.from('org_members').insert({
      org_id: org.id,
      user_id: user.id,
      role: 'owner',
      invited_by: user.id,
    })

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
