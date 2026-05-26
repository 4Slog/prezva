import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/get-user'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; volunteerId: string }> }
) {
  await requireUser()
  const { volunteerId } = await params
  // Admin client: delete volunteer record
  const admin = createAdminClient()
  const { error } = await admin.from('volunteers').delete().eq('id', volunteerId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
