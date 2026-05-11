'use server'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { NextResponse } from 'next/server'

export async function POST() {
  await requireUser()
  const supabase = await createClient()

  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
  })
}
