import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/get-user'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  await requireUser()
  const { id } = await params
  // Admin client: update volunteer status
  const admin = createAdminClient()
  const { error } = await admin
    .from('volunteers')
    .update({ status: 'checked_in', clocked_in_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
