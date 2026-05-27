'use server'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { mfaVerifyLimiter, checkRateLimit } from '@/lib/ratelimit'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const Schema = z.object({
  factorId: z.string(),
  code: z.string().length(6).regex(/^\d+$/),
})

export async function POST(req: NextRequest) {
  const user = await requireUser()

  // Rate limit per user to prevent brute-force of the 6-digit TOTP code.
  const { limited } = await checkRateLimit(mfaVerifyLimiter, user.id)
  if (limited) {
    return NextResponse.json(
      { error: 'Too many attempts — try again in a minute.' },
      { status: 429 },
    )
  }

  const supabase = await createClient()

  const body = await req.json()
  const parsed = Schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })

  const { factorId, code } = parsed.data

  const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId })
  if (challengeErr) return NextResponse.json({ error: challengeErr.message }, { status: 400 })

  const { error: verifyErr } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code,
  })
  if (verifyErr) return NextResponse.json({ error: verifyErr.message }, { status: 400 })

  return NextResponse.json({ success: true })
}
