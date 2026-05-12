import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Lazy init — env vars are injected by Vitest before tests run, not at import time.
let _db: SupabaseClient | null = null
export function getDb(): SupabaseClient {
  if (!_db) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error('Missing Supabase env vars — check .env.test')
    _db = createClient(url, key)
  }
  return _db
}

// Alias used by tests — resolves lazily via Proxy so tests can import `db` at module level.
export const db = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getDb() as unknown as Record<string | symbol, unknown>)[prop]
  },
})

// Stable demo data IDs seeded by audit/scripts/seed.py
export const DEMO = {
  userId:       '639b6098-8be3-44c3-91a3-7b4c43c5dc9b',
  orgId:        '4ab17b77-4f76-4091-b0cc-509045cb9998',
  eventId:      'a8a984c8-27f3-4391-ba40-ebedfaeb279d',
  surveyId:     '9f03d1e5-0e1d-4c6c-9080-dd98a945b9c9',
  sessionId:    'c474ee33-acf1-4670-b5ca-9a8d856c474c',
  ticketFreeId: '6fc9db3d-b5c2-4dde-8754-73d5473466cd',
  ticketPaidId: 'fc0dc49e-54ae-4297-a913-3d621c3bfd04',
}

// All integration test rows use this email suffix so cleanup is safe and targeted.
export const INTTEST_EMAIL_SUFFIX = '@prezva-inttest.invalid'

export async function cleanupIntTestData() {
  // Delete in dependency order (children first)
  await db.from('survey_questions').delete().like('question_text', '%inttest%')
  await db.from('session_bookmarks').delete().eq('user_id', DEMO.userId).neq('session_id', DEMO.sessionId)
  await db.from('registrations').delete().like('attendee_email', `%${INTTEST_EMAIL_SUFFIX}`)
  await db.from('org_members')
    .delete()
    .eq('org_id', DEMO.orgId)
    .neq('user_id', DEMO.userId) // never delete the demo owner

  // Recalculate quantity_sold after deletes — DELETE trigger is absent, so the counter
  // drifts upward with each test run until capacity enforcement blocks new inserts.
  for (const ticketId of [DEMO.ticketFreeId, DEMO.ticketPaidId]) {
    const { count } = await db
      .from('registrations')
      .select('*', { count: 'exact', head: true })
      .eq('ticket_type_id', ticketId)
      .eq('status', 'confirmed')
    await db
      .from('ticket_types')
      .update({ quantity_sold: count ?? 0 })
      .eq('id', ticketId)
  }
}
