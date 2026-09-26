import type { SupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/get-user'
import { BLOCKED_MESSAGE, deleteAccount, SOLE_OWNER_MESSAGE } from '@/lib/gdpr/delete'
import { gdprSubject } from '@/lib/gdpr/export'

const Schema = z.object({ confirm: z.literal(true) })

// O152: account deletion, run from the GDPR export registry (src/lib/gdpr/
// delete.ts). Matches the subject exactly as the export does — user id and,
// only once confirmed, their auth email. Reports success only when every step
// succeeded, including removing the auth user.
export async function POST(req: NextRequest) {
  const user = await requireUser()

  const body = await req.json().catch(() => null)
  const parsed = Schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Pass { confirm: true } to confirm deletion' }, { status: 400 })

  const result = await deleteAccount(createAdminClient() as unknown as SupabaseClient, gdprSubject(user))

  if (!result.ok) {
    if (result.reason === 'sole_owner') {
      return NextResponse.json({ success: false, error: SOLE_OWNER_MESSAGE(result.orgs) }, { status: 409 })
    }
    if (result.reason === 'blocked') {
      return NextResponse.json({ success: false, error: BLOCKED_MESSAGE }, { status: 409 })
    }
    console.error('[gdpr delete] failed', { userId: user.id, step: result.step, error: result.message })
    return NextResponse.json(
      {
        success: false,
        error: 'Your account could not be deleted. Some of your data may already have been removed or anonymised, but your account still exists. Please try again, or contact support if it keeps failing.',
      },
      { status: 500 },
    )
  }

  // The auth user is gone; clearing this browser's session is best-effort.
  try {
    const supabase = await createClient()
    await supabase.auth.signOut()
  } catch {}

  return NextResponse.json({
    success: true,
    note: 'Your account has been deleted. Payment, attendance, certificate and waiver records are kept without your personal details; everything else has been removed.',
  })
}
