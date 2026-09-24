import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { POINT_VALUES } from '@/lib/engagement/point-values'

// Server-only point helpers. They trust their arguments, so they must never be
// exported from a 'use server' module: callers establish who the registration
// or user is (and that it belongs to the event) before calling.

async function pointsFor(eventId: string, action: string, overridePoints?: number): Promise<number> {
  if (typeof overridePoints === 'number') return overridePoints
  let points = POINT_VALUES[action] ?? 1
  const admin = createAdminClient()
  const { data: event } = await admin.from('events').select('leaderboard_point_config').eq('id', eventId).maybeSingle()
  const config = (event as { leaderboard_point_config?: Record<string, number> } | null)?.leaderboard_point_config
  if (config && typeof config[action] === 'number') points = config[action]
  return points
}

// Awards points to a registration (guest identity). The unique index
// leaderboard_points_reg_action_idx (event_id, registration_id, action) makes a
// repeat a no-op; a repeat returns 0 so callers never report points twice.
export async function awardPointsForReg(eventId: string, registrationId: string, action: string, overridePoints?: number): Promise<number> {
  const points = await pointsFor(eventId, action, overridePoints)
  const admin = createAdminClient()
  const { error } = await admin
    .from('leaderboard_points')
    .insert({ event_id: eventId, registration_id: registrationId, action, points })
  if (error) {
    if (!error.code?.includes('23505')) console.error('[leaderboard] awardPointsForReg error:', error.message)
    return 0
  }
  return points
}
