import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

// GDPR data export (E-R4). Read with the service role — RLS only returned rows
// with user_id = auth.uid(), which missed guest registrations and anything
// matched by email — and scoped here to the requesting person:
//   - their user id,
//   - their verified auth email (matched case-insensitively, exact),
//   - the registrations those two find (for tables keyed by registration_id).
// Any query error fails the whole export; a partial file would read as "this
// is everything we hold".
//
// Every table with a personal-data column is either exported below or listed in
// GDPR_EXCLUDED_TABLES with the reason; gdpr-export.test.ts enforces that.

export type Subject = { userId: string; email: string | null }

type Match =
  | { col: string; by: 'user' }
  | { col: string; by: 'email' }
  | { col: string; by: 'registration' }

export type ExportTable = { table: string; match: Match[]; label?: string }

// Registrations first: their ids feed the registration-keyed tables.
export const GDPR_REGISTRATIONS: ExportTable = {
  table: 'registrations',
  match: [{ col: 'user_id', by: 'user' }, { col: 'attendee_email', by: 'email' }],
}

export const GDPR_EXPORT_TABLES: ExportTable[] = [
  { table: 'profiles', match: [{ col: 'id', by: 'user' }] },
  { table: 'user_profiles', match: [{ col: 'user_id', by: 'user' }] },
  { table: 'attendee_profiles', match: [{ col: 'user_id', by: 'user' }, { col: 'registration_id', by: 'registration' }] },
  { table: 'attendee_preferences', match: [{ col: 'user_id', by: 'user' }] },
  { table: 'registration_field_responses', match: [{ col: 'registration_id', by: 'registration' }] },
  { table: 'registration_add_ons', match: [{ col: 'registration_id', by: 'registration' }] },
  { table: 'check_ins', match: [{ col: 'registration_id', by: 'registration' }] },
  { table: 'daily_check_ins', match: [{ col: 'registration_id', by: 'registration' }] },
  { table: 'session_attendance', match: [{ col: 'registration_id', by: 'registration' }] },
  { table: 'issued_certificates', match: [{ col: 'registration_id', by: 'registration' }] },
  { table: 'push_subscriptions', match: [{ col: 'registration_id', by: 'registration' }] },
  { table: 'waiver_signatures', match: [{ col: 'user_id', by: 'user' }, { col: 'registration_id', by: 'registration' }] },
  { table: 'sponsor_leads', match: [{ col: 'registration_id', by: 'registration' }, { col: 'attendee_email', by: 'email' }] },
  { table: 'abandoned_carts', match: [{ col: 'email', by: 'email' }] },
  { table: 'ticket_invite_allowlist', match: [{ col: 'email', by: 'email' }] },
  { table: 'email_suppressions', match: [{ col: 'email', by: 'email' }] },
  { table: 'survey_responses', match: [{ col: 'user_id', by: 'user' }, { col: 'registration_id', by: 'registration' }] },
  { table: 'session_bookmarks', match: [{ col: 'user_id', by: 'user' }] },
  { table: 'session_notes', match: [{ col: 'user_id', by: 'user' }] },
  { table: 'session_feedback', match: [{ col: 'user_id', by: 'user' }] },
  { table: 'session_questions', match: [{ col: 'user_id', by: 'user' }] },
  { table: 'session_question_upvotes', match: [{ col: 'user_id', by: 'user' }] },
  { table: 'session_messages', match: [{ col: 'user_id', by: 'user' }] },
  { table: 'session_poll_votes', match: [{ col: 'user_id', by: 'user' }, { col: 'registration_id', by: 'registration' }] },
  { table: 'poll_votes', match: [{ col: 'user_id', by: 'user' }] },
  { table: 'trivia_answers', match: [{ col: 'user_id', by: 'user' }] },
  { table: 'leaderboard_points', match: [{ col: 'user_id', by: 'user' }, { col: 'registration_id', by: 'registration' }] },
  { table: 'attendee_points', match: [{ col: 'user_id', by: 'user' }] },
  { table: 'passport_visits', match: [{ col: 'user_id', by: 'user' }] },
  { table: 'icebreaker_completions', match: [{ col: 'user_id', by: 'user' }] },
  { table: 'photo_contest_entries', match: [{ col: 'user_id', by: 'user' }] },
  { table: 'photo_contest_votes', match: [{ col: 'user_id', by: 'user' }] },
  { table: 'community_posts', match: [{ col: 'author_id', by: 'user' }] },
  { table: 'community_replies', match: [{ col: 'author_id', by: 'user' }] },
  { table: 'community_photos', match: [{ col: 'user_id', by: 'user' }] },
  { table: 'community_rsvps', match: [{ col: 'user_id', by: 'user' }] },
  { table: 'community_upvotes', match: [{ col: 'user_id', by: 'user' }] },
  { table: 'conversations', match: [{ col: 'participant_a', by: 'user' }, { col: 'participant_b', by: 'user' }] },
  { table: 'messages', match: [{ col: 'sender_id', by: 'user' }] },
  { table: 'group_conversation_members', match: [{ col: 'user_id', by: 'user' }] },
  { table: 'group_messages', match: [{ col: 'sender_id', by: 'user' }] },
  { table: 'meeting_requests', match: [{ col: 'requester_id', by: 'user' }, { col: 'recipient_id', by: 'user' }] },
  { table: 'user_notifications', match: [{ col: 'user_id', by: 'user' }] },
  { table: 'speakers', match: [{ col: 'user_id', by: 'user' }, { col: 'email', by: 'email' }] },
  { table: 'org_speakers', match: [{ col: 'email', by: 'email' }] },
  { table: 'volunteers', match: [{ col: 'user_id', by: 'user' }, { col: 'email', by: 'email' }] },
  { table: 'sponsor_contacts', match: [{ col: 'email', by: 'email' }] },
  { table: 'org_members', match: [{ col: 'user_id', by: 'user' }] },
  { table: 'org_invites', match: [{ col: 'email', by: 'email' }] },
  { table: 'org_member_invites', match: [{ col: 'email', by: 'email' }] },
  { table: 'staff_invites', match: [{ col: 'email', by: 'email' }] },
  { table: 'invite_codes', match: [{ col: 'email', by: 'email' }] },
  { table: 'ai_drafts_log', match: [{ col: 'user_id', by: 'user' }] },
  { table: 'audit_logs', match: [{ col: 'user_id', by: 'user' }] },
]

// Tables with a person-like column that are NOT the subject's personal data.
export const GDPR_EXCLUDED_TABLES: Record<string, string> = {
  announcements: 'created_by records the staff author of an organization message',
  events: 'created_by / ghl_creator_email record the staff creator of an organization event',
  organizations: 'organization record (created_by is the founding staff member; email is the org contact)',
  org_templates: 'created_by records the staff author of an organization template',
  surveys: 'created_by records the staff author of an organization survey',
  group_conversations: 'created_by only; the subject’s membership and messages are exported',
  event_documents: 'uploaded_by records the staff uploader of an organization document',
  session_documents: 'uploaded_by records the staff uploader of an organization document',
  event_sponsors: 'contact_email is a sponsor company’s contact; sponsor people are in sponsor_contacts',
  run_of_show_items: 'responsible_email assigns staff duties on the organization’s run of show',
}

// Bearer secrets that must not travel in a downloaded file: every *token /
// *secret / pin column (registrations.app_access_token, press_token,
// certificate_token, pin, invite and portal tokens…), the check-in QR code,
// invite/redemption codes, and push-subscription keys.
const SECRET_KEY = /(^|_)(token|secret|pin)$|^(qr_code|code|p256dh|auth|portal_token_expires_at)$/
const PAGE = 1000
const REG_CHUNK = 100

// PostgREST .or() values: quote so commas/parentheses in an email cannot
// break out of the filter.
const quote = (v: string) => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

// One .or() filter per request: the user/email parts go in the first; the
// subject's registration ids are split into chunks so no URL grows unbounded.
function orFilters(match: Match[], subject: Subject, regIds: string[]): string[] {
  const base: string[] = []
  const regCols: string[] = []
  for (const m of match) {
    if (m.by === 'user') base.push(`${m.col}.eq.${quote(subject.userId)}`)
    else if (m.by === 'email' && subject.email) base.push(`${m.col}.ilike.${quote(subject.email.replace(/([\\%_])/g, '\\$1'))}`)
    else if (m.by === 'registration') regCols.push(m.col)
  }
  const chunks: string[][] = []
  for (let i = 0; i < regIds.length; i += REG_CHUNK) chunks.push(regIds.slice(i, i + REG_CHUNK))
  const filters: string[] = []
  if (regCols.length === 0 || chunks.length === 0) {
    if (base.length > 0) filters.push(base.join(','))
    return filters
  }
  chunks.forEach((chunk, i) => {
    const regParts = regCols.map(c => `${c}.in.(${chunk.map(quote).join(',')})`)
    filters.push([...(i === 0 ? base : []), ...regParts].join(','))
  })
  return filters
}

function clean(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map(r => Object.fromEntries(Object.entries(r).filter(([k]) => !SECRET_KEY.test(k))))
}

// Pages through every match (PostgREST caps a response at max_rows without an
// error), so a heavy table can never come back silently truncated.
type Query = ReturnType<ReturnType<SupabaseClient['from']>['select']>

async function readAll(db: SupabaseClient, table: string, apply: (q: Query) => Query): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await apply(db.from(table).select('*')).range(from, from + PAGE - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    const rows = (data ?? []) as Record<string, unknown>[]
    out.push(...rows)
    if (rows.length < PAGE) return out
  }
}

async function readTable(db: SupabaseClient, spec: ExportTable, subject: Subject, regIds: string[]) {
  const seen = new Set<string>()
  const rows: Record<string, unknown>[] = []
  for (const filter of orFilters(spec.match, subject, regIds)) {
    for (const r of await readAll(db, spec.table, q => q.or(filter))) {
      const key = r.id != null ? String(r.id) : JSON.stringify(r)
      if (!seen.has(key)) { seen.add(key); rows.push(r) }
    }
  }
  return clean(rows)
}

export async function buildGdprExport(db: SupabaseClient, subject: Subject) {
  const registrations = await readTable(db, GDPR_REGISTRATIONS, subject, [])
  const regIds = registrations.map(r => String(r.id))

  const results = await Promise.all(GDPR_EXPORT_TABLES.map(t => readTable(db, t, subject, regIds)))
  const tables: Record<string, Record<string, unknown>[]> = { registrations }
  GDPR_EXPORT_TABLES.forEach((t, i) => { tables[t.table] = results[i] })

  // Survey answers hang off the subject's responses.
  const responseIds = tables.survey_responses.map(r => String(r.id))
  if (responseIds.length > 0) {
    const answers: Record<string, unknown>[] = []
    for (let i = 0; i < responseIds.length; i += REG_CHUNK) {
      answers.push(...await readAll(db, 'survey_answers', q => q.in('response_id', responseIds.slice(i, i + REG_CHUNK))))
    }
    tables.survey_answers = clean(answers)
  } else {
    tables.survey_answers = []
  }

  return {
    exported_at: new Date().toISOString(),
    account: { id: subject.userId, email: subject.email },
    matched_by: { user_id: subject.userId, verified_email: subject.email },
    tables,
  }
}
