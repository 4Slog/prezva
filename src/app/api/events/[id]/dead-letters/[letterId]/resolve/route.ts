import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/get-user'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; letterId: string }> }
) {
  const user = await requireUser()
  const { letterId } = await params
  // Admin client: mark dead-letter item resolved
  const admin = createAdminClient()
  const { error } = await admin
    .from('dead_letter_items')
    .update({ resolved_at: new Date().toISOString(), resolved_by: user.id })
    .eq('id', letterId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
