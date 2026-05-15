import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
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

  const userId = user.id
  const userEmail = user.email ?? ''

  // 1. Anonymize financial records (keep for legal compliance, scrub PII)
  await supabase
    .from('registrations')
    .update({
      attendee_name: 'Deleted User',
      attendee_email: `deleted-${userId}@redacted.local`,
      attendee_phone: null,
      attendee_company: null,
    })
    .eq('attendee_email', userEmail)

  // 2. Delete all user-generated content and activity
  await Promise.allSettled([
    supabase.from('messages').delete().eq('sender_id', userId),
    supabase.from('group_messages').delete().eq('sender_id', userId),
    supabase.from('community_posts').delete().eq('author_id', userId),
    supabase.from('community_replies').delete().eq('author_id', userId),
    supabase.from('community_upvotes').delete().eq('user_id', userId),
    supabase.from('survey_responses').delete().eq('user_id', userId),
    supabase.from('leaderboard_points').delete().eq('user_id', userId),
    supabase.from('session_feedback').delete().eq('user_id', userId),
    supabase.from('session_bookmarks').delete().eq('user_id', userId),
    supabase.from('session_notes').delete().eq('user_id', userId),
    supabase.from('poll_votes').delete().eq('user_id', userId),
    supabase.from('trivia_answers').delete().eq('user_id', userId),
    supabase.from('icebreaker_completions').delete().eq('user_id', userId),
    supabase.from('passport_visits').delete().eq('user_id', userId),
    supabase.from('photo_contest_entries').delete().eq('user_id', userId),
    supabase.from('photo_contest_votes').delete().eq('user_id', userId),
    supabase.from('attendee_profiles').delete().eq('user_id', userId),
    supabase.from('push_subscriptions').delete().in(
      'registration_id',
      (await supabase
        .from('registrations')
        .select('id')
        .eq('attendee_email', `deleted-${userId}@redacted.local`)
        .then(r => (r.data ?? []).map(x => x.id)))
    ),
  ])

  // 3. Delete the profile row
  await supabase.from('profiles').delete().eq('id', userId)

  // 4. Delete the Supabase auth account — GDPR-required hard delete
  const adminClient = createAdminClient()
  await adminClient.auth.admin.deleteUser(userId)

  // 5. Sign out current session
  await supabase.auth.signOut()

  return NextResponse.json({
    success: true,
    note: 'Payment records have been retained for legal compliance. All other personal data has been removed.',
  })
}
