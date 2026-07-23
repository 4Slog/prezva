import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/get-user'
import { createOrganization } from '@/lib/orgs/create-organization'
import { z } from 'zod'

const Schema = z.object({
  name: z.string().min(2).max(80),
  slug: z.string().min(2).max(40).regex(/^[a-z0-9-]+$/),
  timezone: z.string().min(1),
  invite_code: z.string().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser()
    const body = await req.json()
    const parsed = Schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }
    const result = await createOrganization({
      userId: user.id, userEmail: user.email ?? null,
      name: parsed.data.name, slug: parsed.data.slug, timezone: parsed.data.timezone,
      inviteCode: parsed.data.invite_code ?? null,
    })
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json(result.org, { status: 201 })
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
