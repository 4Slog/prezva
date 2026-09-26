import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'

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

// The one rule for who the subject is, shared by export and delete so both
// always match the same rows: the user id, and the auth email only once it is
// confirmed (trimmed, lowercased).
export function gdprSubject(user: { id: string; email?: string | null; email_confirmed_at?: string | null }): Subject {
  const email = user.email && user.email_confirmed_at ? user.email.trim().toLowerCase() : null
  return { userId: user.id, email }
}

type Match =
  | { col: string; by: 'user' }
  | { col: string; by: 'email' }
  | { col: string; by: 'registration' }

// O152 / F-R7..F-R12: what account deletion does to each table. Every entry
// carries one (the type makes it required; gdpr-delete.test.ts checks it), and
// the delete runs from this registry, so a table added to the export cannot be
// forgotten by the delete.
//   delete     remove the subject's rows (and a storage object, if named)
//   anonymise  keep the row, overwrite personal columns; a function value is
//              computed per row (unique columns, rotated secrets)
//   keep       retained as-is, with the reason (liability, compliance, proof)
//   profile    the profiles row itself: removed by the auth user delete
//              (profiles.id cascades from auth.users), the final step
export type AnonymiseValue = string | number | boolean | null | ((row: { id: string }) => string)
export type DeleteRule =
  | { action: 'delete'; storage?: { bucket: string; column: string; form: 'path' | 'publicUrl' } }
  | {
      action: 'anonymise'
      set: Record<string, AnonymiseValue>
      // Rows hanging off the anonymised rows whose free text is scrubbed too.
      children?: { table: string; fk: string; set: Record<string, AnonymiseValue> }
    }
  | { action: 'keep'; reason: string }
  | { action: 'profile' }

export type ExportTable = { table: string; match: Match[]; label?: string; deleteRule: DeleteRule }

const DELETED_NAME = 'Deleted User'
const redactedEmail = (row: { id: string }) => `deleted-${row.id}@redacted.local`
const rotated = () => randomBytes(24).toString('hex')
const del: DeleteRule = { action: 'delete' }

// Registrations first: their ids feed the registration-keyed tables.
export const GDPR_REGISTRATIONS: ExportTable = {
  table: 'registrations',
  match: [{ col: 'user_id', by: 'user' }, { col: 'attendee_email', by: 'email' }],
  // Financial record: payment/Stripe/refund columns stay. Every bearer secret
  // is rotated so an old QR, PIN or link stops working.
  deleteRule: {
    action: 'anonymise',
    set: {
      user_id: null,
      attendee_name: DELETED_NAME,
      attendee_email: redactedEmail,
      attendee_phone: null,
      attendee_company: null,
      attendee_job_title: null,
      notes: null,
      custom_fields: null,
      utm_content: null,
      sms_opt_in: false,
      sms_opt_in_at: null,
      qr_code: rotated,
      pin: () => String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, '0'),
      app_access_token: rotated,
      certificate_token: rotated,
      press_token: null,
    },
  },
}

export const GDPR_EXPORT_TABLES: ExportTable[] = [
  { table: 'profiles', match: [{ col: 'id', by: 'user' }], deleteRule: { action: 'profile' } },
  { table: 'user_profiles', match: [{ col: 'user_id', by: 'user' }], deleteRule: del },
  { table: 'attendee_profiles', match: [{ col: 'user_id', by: 'user' }, { col: 'registration_id', by: 'registration' }], deleteRule: del },
  { table: 'attendee_preferences', match: [{ col: 'user_id', by: 'user' }], deleteRule: del },
  { table: 'registration_field_responses', match: [{ col: 'registration_id', by: 'registration' }], deleteRule: del },
  { table: 'registration_add_ons', match: [{ col: 'registration_id', by: 'registration' }], deleteRule: { action: 'keep', reason: 'financial line items of a kept registration; no personal data' } },
  { table: 'check_ins', match: [{ col: 'registration_id', by: 'registration' }], deleteRule: { action: 'keep', reason: 'attendance / CE proof; no personal data once the registration is anonymised' } },
  { table: 'daily_check_ins', match: [{ col: 'registration_id', by: 'registration' }], deleteRule: { action: 'keep', reason: 'attendance proof; no personal data' } },
  { table: 'session_attendance', match: [{ col: 'registration_id', by: 'registration' }], deleteRule: { action: 'keep', reason: 'CE proof; no personal data' } },
  { table: 'issued_certificates', match: [{ col: 'registration_id', by: 'registration' }], deleteRule: { action: 'keep', reason: 'verification record; the name comes from the anonymised registration' } },
  { table: 'push_subscriptions', match: [{ col: 'registration_id', by: 'registration' }], deleteRule: del },
  { table: 'waiver_signatures', match: [{ col: 'user_id', by: 'user' }, { col: 'registration_id', by: 'registration' }], deleteRule: { action: 'keep', reason: 'liability record (F-R7); user_id is nulled by the profile FK (0161)' } },
  { table: 'sponsor_leads', match: [{ col: 'registration_id', by: 'registration' }, { col: 'attendee_email', by: 'email' }], deleteRule: { action: 'anonymise', set: { attendee_name: null, attendee_email: null, company: null, job_title: null, note: null } } },
  { table: 'abandoned_carts', match: [{ col: 'email', by: 'email' }], deleteRule: del },
  { table: 'ticket_invite_allowlist', match: [{ col: 'email', by: 'email' }], deleteRule: del },
  { table: 'email_suppressions', match: [{ col: 'email', by: 'email' }], deleteRule: { action: 'keep', reason: 'compliance: prevents re-mailing an address that opted out (F-R8)' } },
  { table: 'survey_responses', match: [{ col: 'user_id', by: 'user' }, { col: 'registration_id', by: 'registration' }], deleteRule: { action: 'anonymise', set: { user_id: null, registration_id: null }, children: { table: 'survey_answers', fk: 'response_id', set: { answer_text: null } } } },
  { table: 'session_bookmarks', match: [{ col: 'user_id', by: 'user' }], deleteRule: del },
  { table: 'session_notes', match: [{ col: 'user_id', by: 'user' }], deleteRule: del },
  { table: 'session_feedback', match: [{ col: 'user_id', by: 'user' }], deleteRule: { action: 'anonymise', set: { user_id: null, comment: null } } },
  { table: 'session_questions', match: [{ col: 'user_id', by: 'user' }], deleteRule: { action: 'anonymise', set: { user_id: null, body: '[deleted]' } } },
  { table: 'session_question_upvotes', match: [{ col: 'user_id', by: 'user' }], deleteRule: del },
  { table: 'session_messages', match: [{ col: 'user_id', by: 'user' }], deleteRule: del },
  { table: 'session_poll_votes', match: [{ col: 'user_id', by: 'user' }, { col: 'registration_id', by: 'registration' }], deleteRule: del },
  { table: 'poll_votes', match: [{ col: 'user_id', by: 'user' }], deleteRule: del },
  { table: 'trivia_answers', match: [{ col: 'user_id', by: 'user' }], deleteRule: del },
  { table: 'leaderboard_points', match: [{ col: 'user_id', by: 'user' }, { col: 'registration_id', by: 'registration' }], deleteRule: del },
  { table: 'attendee_points', match: [{ col: 'user_id', by: 'user' }], deleteRule: del },
  { table: 'passport_visits', match: [{ col: 'user_id', by: 'user' }], deleteRule: del },
  { table: 'icebreaker_completions', match: [{ col: 'user_id', by: 'user' }], deleteRule: del },
  { table: 'photo_contest_entries', match: [{ col: 'user_id', by: 'user' }], deleteRule: { action: 'delete', storage: { bucket: 'event-photos', column: 'storage_path', form: 'path' } } },
  { table: 'photo_contest_votes', match: [{ col: 'user_id', by: 'user' }], deleteRule: del },
  { table: 'community_posts', match: [{ col: 'author_id', by: 'user' }], deleteRule: { action: 'delete', storage: { bucket: 'event-photos', column: 'image_url', form: 'publicUrl' } } },
  { table: 'community_replies', match: [{ col: 'author_id', by: 'user' }], deleteRule: del },
  { table: 'community_photos', match: [{ col: 'user_id', by: 'user' }], deleteRule: { action: 'delete', storage: { bucket: 'event-photos', column: 'photo_url', form: 'publicUrl' } } },
  { table: 'community_rsvps', match: [{ col: 'user_id', by: 'user' }], deleteRule: del },
  { table: 'community_upvotes', match: [{ col: 'user_id', by: 'user' }], deleteRule: del },
  { table: 'conversations', match: [{ col: 'participant_a', by: 'user' }, { col: 'participant_b', by: 'user' }], deleteRule: del },
  { table: 'messages', match: [{ col: 'sender_id', by: 'user' }], deleteRule: del },
  { table: 'group_conversation_members', match: [{ col: 'user_id', by: 'user' }], deleteRule: del },
  { table: 'group_messages', match: [{ col: 'sender_id', by: 'user' }], deleteRule: del },
  { table: 'meeting_requests', match: [{ col: 'requester_id', by: 'user' }, { col: 'recipient_id', by: 'user' }], deleteRule: del },
  { table: 'user_notifications', match: [{ col: 'user_id', by: 'user' }], deleteRule: del },
  { table: 'speakers', match: [{ col: 'user_id', by: 'user' }, { col: 'email', by: 'email' }], deleteRule: { action: 'anonymise', set: { user_id: null, name: DELETED_NAME, email: null, bio: null, photo_url: null, job_title: null, company: null, website: null, linkedin_url: null, twitter_handle: null, confirmation_token: null, ghl_contact_id: null, decline_reason: null, decline_alternative: null, show_email_publicly: false } } },
  { table: 'org_speakers', match: [{ col: 'email', by: 'email' }], deleteRule: { action: 'anonymise', set: { name: DELETED_NAME, email: null, bio: null, photo_url: null, job_title: null, company: null, website: null, linkedin_url: null, twitter_handle: null } } },
  { table: 'volunteers', match: [{ col: 'user_id', by: 'user' }, { col: 'email', by: 'email' }], deleteRule: { action: 'anonymise', set: { user_id: null, name: DELETED_NAME, email: redactedEmail, phone: null, notes: null, shift_decline_reason: null, portal_access_token: rotated } } },
  { table: 'sponsor_contacts', match: [{ col: 'email', by: 'email' }], deleteRule: { action: 'anonymise', set: { name: DELETED_NAME, email: null, portal_token: null } } },
  { table: 'org_members', match: [{ col: 'user_id', by: 'user' }], deleteRule: del },
  { table: 'org_invites', match: [{ col: 'email', by: 'email' }], deleteRule: del },
  { table: 'org_member_invites', match: [{ col: 'email', by: 'email' }], deleteRule: del },
  { table: 'staff_invites', match: [{ col: 'email', by: 'email' }], deleteRule: del },
  { table: 'invite_codes', match: [{ col: 'email', by: 'email' }], deleteRule: { action: 'anonymise', set: { email: null, note: null } } },
  { table: 'ai_drafts_log', match: [{ col: 'user_id', by: 'user' }], deleteRule: del },
  { table: 'audit_logs', match: [{ col: 'user_id', by: 'user' }], deleteRule: { action: 'keep', reason: 'append-only audit trail; user_id is nulled by its profile FK' } },
  // Not in the generated types' personal-column scan (follower/followed,
  // reporter ids), found by the auth.users FK census for O152.
  { table: 'attendee_follows', match: [{ col: 'follower_id', by: 'user' }, { col: 'followed_id', by: 'user' }], deleteRule: del },
  { table: 'community_reports', match: [{ col: 'reporter_id', by: 'user' }], deleteRule: del },
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
export const REG_CHUNK = 100

// PostgREST .or() values: quote so commas/parentheses in an email cannot
// break out of the filter.
const quote = (v: string) => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

// One .or() filter per request: the user/email parts go in the first; the
// subject's registration ids are split into chunks so no URL grows unbounded.
// Shared with the delete (delete.ts) so both match exactly the same rows.
export function orFilters(match: Match[], subject: Subject, regIds: string[]): string[] {
  const base: string[] = []
  const regCols: string[] = []
  for (const m of match) {
    if (m.by === 'user') base.push(`${m.col}.eq.${quote(subject.userId)}`)
    // PostgREST reads `*` in a like pattern as a wildcard and cannot escape it:
    // an address containing one would match other people's rows, so it is
    // never used to match (user id and registrations still are).
    else if (m.by === 'email' && subject.email && !subject.email.includes('*')) base.push(`${m.col}.ilike.${quote(subject.email.replace(/([\\%_])/g, '\\$1'))}`)
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

export async function readAll(db: SupabaseClient, table: string, apply: (q: Query) => Query): Promise<Record<string, unknown>[]> {
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
