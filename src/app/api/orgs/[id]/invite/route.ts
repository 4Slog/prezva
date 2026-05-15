import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { inviteMember } from '@/lib/orgs/actions'
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

    const fd = new FormData()
    fd.set('email', parsed.data.email)
    fd.set('role', parsed.data.role)

    const result = await inviteMember(orgId, fd)

    if (result?.error) {
      if (result.error.includes('Already')) return NextResponse.json({ error: result.error }, { status: 409 })
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ ok: true, message: `Invite sent to ${parsed.data.email}` }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
