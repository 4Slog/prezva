import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  const { code, email } = await req.json()

  if (!code?.trim()) {
    return NextResponse.json({ valid: false, error: 'Invite code is required' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: invite } = await admin
    .from('invite_codes')
    .select('id, code, email, used_at')
    .eq('code', code.trim().toUpperCase())
    .maybeSingle()

  if (!invite) {
    return NextResponse.json({ valid: false, error: 'Invalid invite code' }, { status: 200 })
  }

  if (invite.used_at) {
    return NextResponse.json({ valid: false, error: 'This invite code has already been used' }, { status: 200 })
  }

  // If the code is email-locked, verify it matches
  if (invite.email && email && invite.email.toLowerCase() !== email.toLowerCase()) {
    return NextResponse.json({ valid: false, error: 'This invite code is not valid for this email address' }, { status: 200 })
  }

  return NextResponse.json({ valid: true })
}
