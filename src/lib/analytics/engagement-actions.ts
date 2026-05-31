'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { assertOrgRole } from '@/lib/orgs/actions'

export interface AttendeeEngagement {
  registration_id: string
  user_id: string | null
  attendee_name: string
  attendee_email: string
  checked_in: boolean
  points: number
  trivia_answers: number
  icebreaker_responses: number
  community_posts: number
  feedback_given: number
  sessions_attended: number
  score: number
}

export async function getAttendeeEngagementScores(eventId: string): Promise<AttendeeEngagement[]> {
  const supabase = await createClient()
  const user = await requireUser()

  const { data: event } = await supabase.from('events').select('org_id').eq('id', eventId).single()
  if (!event) return []

  await assertOrgRole(supabase, (event as any).org_id, user.id, ['owner', 'admin', 'staff'])

  const admin = createAdminClient()

  const [regsRes, checkInsRes, pointsRes, triviaRes, iceRes, postsRes, feedbackRes, sessionAttendanceRes] = await Promise.all([
    admin.from('registrations')
      .select('id, user_id, attendee_name, attendee_email')
      .eq('event_id', eventId)
      .in('status', ['confirmed']),
    admin.from('check_ins')
      .select('registration_id')
      .eq('event_id', eventId)
      .is('session_id', null),
    admin.from('leaderboard_points')
      .select('registration_id, user_id, points')
      .eq('event_id', eventId),
    admin.from('trivia_answers')
      .select('user_id, id')
      .eq('event_id', eventId),
    admin.from('icebreaker_completions')
      .select('user_id, id')
      .eq('event_id', eventId),
    admin.from('community_posts')
      .select('user_id, id')
      .eq('event_id', eventId),
    admin.from('session_feedback')
      .select('user_id, id')
      .eq('event_id', eventId),
    admin.from('session_attendance')
      .select('registration_id, session_id')
      .eq('event_id', eventId),
  ])

  const regs = (regsRes.data ?? []) as any[]
  const checkedInRegIds = new Set((checkInsRes.data ?? []).map((c: any) => c.registration_id))

  const sessionAttendanceByReg: Record<string, number> = {}
  for (const row of (sessionAttendanceRes.data ?? []) as any[]) {
    if (row.registration_id) {
      sessionAttendanceByReg[row.registration_id] = (sessionAttendanceByReg[row.registration_id] ?? 0) + 1
    }
  }

  const pointsByUser: Record<string, number> = {}
  for (const p of (pointsRes.data ?? []) as any[]) {
    const key = p.user_id ?? p.registration_id
    if (key) pointsByUser[key] = (pointsByUser[key] ?? 0) + (p.points ?? 0)
  }

  const triviaByUser: Record<string, number> = {}
  for (const t of (triviaRes.data ?? []) as any[]) {
    if (t.user_id) triviaByUser[t.user_id] = (triviaByUser[t.user_id] ?? 0) + 1
  }

  const iceByUser: Record<string, number> = {}
  for (const i of (iceRes.data ?? []) as any[]) {
    if (i.user_id) iceByUser[i.user_id] = (iceByUser[i.user_id] ?? 0) + 1
  }

  const postsByUser: Record<string, number> = {}
  for (const p of (postsRes.data ?? []) as any[]) {
    if (p.user_id) postsByUser[p.user_id] = (postsByUser[p.user_id] ?? 0) + 1
  }

  const feedbackByUser: Record<string, number> = {}
  for (const f of (feedbackRes.data ?? []) as any[]) {
    if (f.user_id) feedbackByUser[f.user_id] = (feedbackByUser[f.user_id] ?? 0) + 1
  }

  const scores: AttendeeEngagement[] = regs.map((reg: any) => {
    const uid = reg.user_id
    const checkedIn = checkedInRegIds.has(reg.id)
    const points = pointsByUser[uid ?? reg.id] ?? 0
    const triviaCount = triviaByUser[uid] ?? 0
    const iceCount = iceByUser[uid] ?? 0
    const postCount = postsByUser[uid] ?? 0
    const feedbackCount = feedbackByUser[uid] ?? 0
    const sessionsAttended = sessionAttendanceByReg[reg.id] ?? 0

    const checkInScore = checkedIn ? 20 : 0
    const triviaScore = Math.min(15, triviaCount * 3)
    const iceScore = Math.min(10, iceCount * 5)
    const postScore = Math.min(15, postCount * 5)
    const feedbackScore = feedbackCount > 0 ? 10 : 0
    const pointsScore = points > 0 ? Math.min(30, Math.round((points / 100) * 30)) : 0

    const score = Math.min(100, checkInScore + triviaScore + iceScore + postScore + feedbackScore + pointsScore)

    return {
      registration_id: reg.id,
      user_id: uid,
      attendee_name: reg.attendee_name,
      attendee_email: reg.attendee_email,
      checked_in: checkedIn,
      points,
      trivia_answers: triviaCount,
      icebreaker_responses: iceCount,
      community_posts: postCount,
      feedback_given: feedbackCount,
      sessions_attended: sessionsAttended,
      score,
    }
  })

  return scores.sort((a, b) => b.score - a.score)
}
