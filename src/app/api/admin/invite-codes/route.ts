import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin/gate'

// GET /api/admin/invite-codes — list all codes
export async function GET() {
  await requireAdmin()

  const admin = createAdminClient()
  const { data } = await admin
    .from('invite_codes')
    .select('*')
    .order('created_at', { ascending: false })

  return NextResponse.json({ codes: data })
}

// POST /api/admin/invite-codes — generate new code(s)
// Body: { email?: string, note?: string, count?: number }
export async function POST(req: NextRequest) {
  const adminEmail = await requireAdmin()

  const { email, note, count = 1 } = await req.json()
  const admin = createAdminClient()

  const codes = []
  for (let i = 0; i < Math.min(count, 50); i++) {
    const code = `PREZVA-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
    codes.push({
      code,
      email: email ?? null,
      note: note ?? null,
      created_by: adminEmail,
    })
  }

  const { data, error } = await admin
    .from('invite_codes')
    .insert(codes)
    .select('code, email, note')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ created: data })
}
