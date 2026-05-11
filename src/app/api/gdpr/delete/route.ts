import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const Schema = z.object({ confirm: z.literal(true) })

export async function POST(req: NextRequest) {
  const user = await requireUser()
  const supabase = await createClient()

  const body = await req.json()
  const parsed = Schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Pass { confirm: true } to confirm deletion' }, { status: 400 })

  // Anonymize registrations (keep for financial records, scrub PII)
  await supabase
    .from('registrations')
    .update({
      attendee_name: 'Deleted User',
      attendee_email: `deleted-${user.id}@redacted.local`,
    })
    .eq('attendee_email', user.email ?? '')

  // Delete messages, survey responses, push subscriptions
  await Promise.all([
    supabase.from('messages').delete().eq('sender_id', user.id),
    supabase.from('survey_responses').delete().eq('user_id', user.id),
    supabase.from('push_subscriptions').delete().in(
      'registration_id',
      (await supabase.from('registrations')
        .select('id')
        .eq('attendee_email', `deleted-${user.id}@redacted.local`)
        .then(r => (r.data ?? []).map(x => x.id)))
    ),
  ])

  await supabase.auth.signOut()

  return NextResponse.json({
    success: true,
    note: 'Payment records have been retained for legal compliance. All other personal data has been removed.',
  })
}
