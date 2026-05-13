import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  // Admin client: validate token and update volunteer record
  const admin = createAdminClient()
  const { data: volunteer } = await admin
    .rpc('get_volunteer_by_token', { p_token: token })

  if (!volunteer) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  if (volunteer.clocked_in_at) return NextResponse.json({ error: 'Already clocked in' }, { status: 409 })

  const clocked_in_at = new Date().toISOString()
  const { error } = await admin
    .from('volunteers')
    .update({ clocked_in_at, status: 'checked_in' })
    .eq('id', volunteer.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ clocked_in_at })
}
