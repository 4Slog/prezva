'use server'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const Schema = z.object({ factorId: z.string() })

export async function POST(req: NextRequest) {
  await requireUser()
  const supabase = await createClient()

  const body = await req.json()
  const parsed = Schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })

  const { error } = await supabase.auth.mfa.unenroll({ factorId: parsed.data.factorId })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ success: true })
}
