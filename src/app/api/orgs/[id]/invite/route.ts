import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { z } from 'zod'

const Schema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'staff']),
})

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id: orgId } = await params
    const user = await requireUser()
    const supabase = await createClient()

    const { data: membership } = await supabase
      .from('org_members')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const parsed = Schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', parsed.data.email)
      .maybeSingle()

    if (!profile) {
      return NextResponse.json({ error: 'No Prezva account found for that email' }, { status: 404 })
    }

    const { data: existing } = await supabase
      .from('org_members')
      .select('id')
      .eq('org_id', orgId)
      .eq('user_id', profile.id)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ error: 'Already a member' }, { status: 409 })
    }

    const { data, error } = await supabase
      .from('org_members')
      .insert({ org_id: orgId, user_id: profile.id, role: parsed.data.role, invited_by: user.id })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
