/**
 * Stage 00 — Wipe
 *
 * DESTRUCTIVE. NEVER invoked during dry-run.
 * Three independent guards must ALL hold or execution is refused:
 *   1. --confirm-wipe CLI flag
 *   2. SEED_ALLOW_WIPE=1 environment variable
 *   3. Connected Supabase project ref == jmhxyyrleipcorvkmxfk
 *
 * What it does when guards pass:
 *   a. Verifies project ref from SUPABASE_DB_URL or SUPABASE_PROJECT_URL.
 *   b. TRUNCATEs every public app table with RESTART IDENTITY CASCADE using a
 *      direct postgres connection (SUPABASE_DB_URL required).
 *      CASCADE handles all FK depths automatically — no hand-ordered delete chains.
 *   c. Deletes every auth.users row EXCEPT sowu.paul@gmail.com
 *      (id 43280c9b-60a7-4884-94b0-1c80e5af1a9d) via the Supabase auth admin API.
 *
 * Required env vars (in addition to standard service-role vars):
 *   SUPABASE_DB_URL=postgresql://postgres:PASSWORD@db.<ref>.supabase.co:5432/postgres
 */

import postgres from 'postgres'
import type { SupabaseClient } from '@supabase/supabase-js'
import { log } from '../lib/logger'
import { extractProjectRef } from '../lib/client'
import type { StageSummary } from '../lib/logger'

const EXPECTED_REF     = 'jmhxyyrleipcorvkmxfk'
const PRESERVED_UID    = '43280c9b-60a7-4884-94b0-1c80e5af1a9d'

/** All 97 public app tables — listed explicitly so additions to the schema are visible in git diff. */
const PUBLIC_TABLES = [
  'abandoned_carts', 'add_on_sessions', 'add_ons', 'ai_drafts_log', 'announcements',
  'attendee_follows', 'attendee_points', 'attendee_preferences', 'attendee_profiles',
  'audit_logs', 'badge_templates', 'certificate_templates', 'check_ins', 'community_photos',
  'community_posts', 'community_replies', 'community_reports', 'community_rsvps',
  'community_upvotes', 'conversations', 'daily_check_ins', 'dead_letter_items',
  'discount_codes', 'email_suppressions', 'event_documents', 'event_folders',
  'event_sponsors', 'event_templates', 'event_waivers', 'events', 'form_fields',
  'group_conversation_members', 'group_conversations', 'group_messages', 'group_tickets',
  'icebreaker_completions', 'icebreaker_questions', 'integration_errors', 'invite_codes',
  'issued_certificates', 'leaderboard_points', 'meeting_requests', 'messages',
  'offline_queue', 'org_integrations', 'org_member_invites', 'org_members', 'org_speakers',
  'org_templates', 'organizations', 'passport_locations', 'passport_visits',
  'photo_contest_entries', 'photo_contest_votes', 'poll_templates', 'poll_votes', 'profiles',
  'push_subscriptions', 'registration_add_ons', 'registration_field_responses',
  'registrations', 'rooms', 'run_of_show_items', 'session_attendance', 'session_bookmarks',
  'session_documents', 'session_feedback', 'session_handouts', 'session_messages',
  'session_notes', 'session_poll_votes', 'session_polls', 'session_question_upvotes',
  'session_questions', 'session_speakers', 'session_ticket_access', 'sessions',
  'speaker_conversations', 'speaker_form_submissions', 'speaker_messages', 'speaker_tokens',
  'speakers', 'sponsor_contacts', 'sponsor_leads', 'staff_invites', 'survey_answers',
  'survey_questions', 'survey_responses', 'survey_templates', 'surveys',
  'ticket_invite_allowlist', 'ticket_types', 'tracks', 'trivia_answers', 'trivia_questions',
  'user_profiles', 'venue_maps', 'volunteers', 'waiver_signatures',
] as const

export async function runWipe(
  supabase: SupabaseClient,
  opts: { dryRun: boolean; confirmWipe: boolean },
): Promise<StageSummary> {
  // Guard 1: never under dry-run
  if (opts.dryRun) {
    throw new Error('Wipe refuses --dry-run. Use --execute --confirm-wipe to run for real.')
  }

  // Guard 2: --confirm-wipe required
  if (!opts.confirmWipe) {
    throw new Error('Wipe requires --confirm-wipe. This operation is irreversible.')
  }

  // Guard 3: SEED_ALLOW_WIPE=1 env var required
  if (process.env.SEED_ALLOW_WIPE !== '1') {
    throw new Error('Wipe requires SEED_ALLOW_WIPE=1 in environment.')
  }

  // Guard 4: project ref must match expected (derived from URL, not asserted by the caller)
  const supabaseUrl = process.env.SUPABASE_PROJECT_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const actualRef = extractProjectRef(supabaseUrl)
  if (actualRef !== EXPECTED_REF) {
    throw new Error(
      `Project ref mismatch: connected to "${actualRef}", expected "${EXPECTED_REF}". Refusing wipe.`,
    )
  }

  log.section('Stage 00: Wipe')
  log.warn(`Wiping ALL public app data. Preserving auth.users row ${PRESERVED_UID} (sowu.paul)`)

  // ── Step A: TRUNCATE all public tables via direct postgres connection ──────────────────────────
  const dbUrl = process.env.SUPABASE_DB_URL
  if (!dbUrl) throw new Error('Missing env: SUPABASE_DB_URL (needed for raw TRUNCATE)')

  const sql = postgres(dbUrl, { max: 1, idle_timeout: 20, connect_timeout: 30 })
  try {
    const tableList = PUBLIC_TABLES.map(t => `"${t}"`).join(', ')
    await sql.unsafe(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`)
    log.ok(`Truncated ${PUBLIC_TABLES.length} public tables`)
  } finally {
    await sql.end()
  }

  // ── Step B: Delete all auth users except the preserved one ────────────────────────────────────
  const PAGE_SIZE = 1000
  const toDelete: string[] = []
  let page = 1

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PAGE_SIZE })
    if (error) throw new Error(`auth.admin.listUsers failed: ${error.message}`)
    for (const u of data.users) {
      if (u.id !== PRESERVED_UID) toDelete.push(u.id)
    }
    if (data.users.length < PAGE_SIZE) break
    page++
  }

  log.info(`Deleting ${toDelete.length} auth user(s) (preserving ${PRESERVED_UID})`)
  let deleted = 0
  for (const uid of toDelete) {
    const { error } = await supabase.auth.admin.deleteUser(uid)
    if (error) log.warn(`Could not delete auth user ${uid}: ${error.message}`)
    else deleted++
  }
  log.ok(`Deleted ${deleted}/${toDelete.length} auth users`)

  return { stage: 'wipe', planned: toDelete.length, actual: deleted }
}
