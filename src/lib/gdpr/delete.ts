import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createHmac } from 'node:crypto'
import {
  GDPR_EXPORT_TABLES,
  GDPR_REGISTRATIONS,
  REG_CHUNK,
  orFilters,
  readAll,
  type AnonymiseValue,
  type ExportTable,
  type Subject,
} from './export'

// O152 account deletion (F-R7..F-R12), driven by the export registry: every
// table the export returns carries a deleteRule, and this runs them. The
// subject is matched exactly as the export matches them (user id, verified
// email, and the registrations those find), with the service role.
//
// Order:
//   1. preflight, before any write: refuse a sole owner of an organization
//      (F-R11) and a row we cannot release (group_conversations.created_by)
//   2. collect the subject's registration ids BEFORE anything is renamed
//   3. storage objects owned by construction (avatar, attendee photos)
//   4. every registry rule except registrations; registration-keyed tables
//      are found through the ids from step 2
//   5. release staff/actor references (auth.users FKs with no ON DELETE
//      action block auth.admin.deleteUser while any remain)
//   6. anonymise the registrations — last data step, so a run that failed
//      earlier still finds them on retry
//   7. delete the auth user; the profile row goes with it (profiles.id
//      cascades from auth.users), and 0161 made every FK to profiles
//      SET NULL or CASCADE
// The first error stops the run and is reported; success is returned only
// when every step succeeded. Every step is safe to repeat.

// Nullable columns that reference auth.users with no ON DELETE action, on rows
// the organization keeps. The subject is the actor here (who checked someone
// in, who resolved a report, who sent an invite), not the row's owner.
export type ActorReference = { table: string; col: string; by: 'user' | 'email'; alsoNull?: string[] }
export const GDPR_ACTOR_REFERENCES: ActorReference[] = [
  { table: 'check_ins', col: 'checked_in_by', by: 'user', alsoNull: ['checked_in_by_email'] },
  { table: 'check_ins', col: 'checked_in_by_email', by: 'email' },
  { table: 'daily_check_ins', col: 'checked_in_by', by: 'user' },
  { table: 'session_attendance', col: 'checked_in_by', by: 'user' },
  { table: 'dead_letter_items', col: 'resolved_by', by: 'user' },
  { table: 'community_reports', col: 'resolved_by', by: 'user' },
  { table: 'org_invites', col: 'invited_by', by: 'user' },
  { table: 'staff_invites', col: 'invited_by', by: 'user' },
]

// NOT NULL references to auth.users with no ON DELETE action that the delete
// cannot release: auth.admin.deleteUser would fail on them after every other
// step had run, so they are checked up front and the delete refused cleanly.
export const GDPR_BLOCKING_REFERENCES: { table: string; col: string }[] = [
  { table: 'group_conversations', col: 'created_by' },
]

export const BLOCKED_MESSAGE =
  'Your account cannot be deleted automatically because you created a group conversation. Please contact support to finish deleting your account.'

export const SOLE_OWNER_MESSAGE = (orgs: string[]) =>
  `You are the only owner of ${orgs.join(', ')}. Transfer ownership to another member before deleting your account.`

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; reason: 'sole_owner'; orgs: string[] }
  | { ok: false; reason: 'blocked'; table: string }
  | { ok: false; reason: 'failed'; step: string; message: string }

class StepError extends Error {
  constructor(readonly step: string, message: string) { super(message) }
}

function check(step: string, error: { message: string } | null | undefined) {
  if (error) throw new StepError(step, error.message)
}

type MemberRow = { org_id: string; role: string | null; roles: { slug: string } | { slug: string }[] | null }

function isOwner(m: MemberRow): boolean {
  const slug = Array.isArray(m.roles) ? m.roles[0]?.slug : m.roles?.slug
  // RBAC role decides; the legacy enum only when no role row is linked.
  return slug ? slug === 'owner' : m.role === 'owner'
}

async function soleOwnedOrgs(db: SupabaseClient, userId: string): Promise<string[]> {
  const { data: mine, error } = await db
    .from('org_members')
    .select('org_id, role, roles(slug), organizations(name)')
    .eq('user_id', userId)
  check('org_members (owner check)', error)
  const blocked: string[] = []
  type Mine = MemberRow & { organizations: { name: string } | { name: string }[] | null }
  for (const m of (mine ?? []) as unknown as Mine[]) {
    if (!isOwner(m)) continue
    const { data: members, error: membersErr } = await db
      .from('org_members')
      .select('org_id, role, roles(slug)')
      .eq('org_id', m.org_id)
    check('org_members (owner check)', membersErr)
    if (((members ?? []) as unknown as MemberRow[]).filter(isOwner).length <= 1) {
      const org = Array.isArray(m.organizations) ? m.organizations[0] : m.organizations
      blocked.push(org?.name ?? 'an organization')
    }
  }
  return blocked
}

function valuesFor(set: Record<string, AnonymiseValue>, row: { id: string }): Record<string, unknown> {
  return Object.fromEntries(Object.entries(set).map(([k, v]) => [k, typeof v === 'function' ? v(row) : v]))
}

function chunks<T>(list: T[]): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += REG_CHUNK) out.push(list.slice(i, i + REG_CHUNK))
  return out
}

async function readMatched(db: SupabaseClient, spec: ExportTable, subject: Subject, regIds: string[]) {
  const seen = new Set<string>()
  const rows: Record<string, unknown>[] = []
  for (const filter of orFilters(spec.match, subject, regIds)) {
    let found: Record<string, unknown>[]
    try {
      found = await readAll(db, spec.table, q => q.or(filter))
    } catch (e) {
      throw new StepError(spec.table, (e as Error).message)
    }
    for (const r of found) {
      const key = String(r.id)
      if (!seen.has(key)) { seen.add(key); rows.push(r) }
    }
  }
  return rows as ({ id: string } & Record<string, unknown>)[]
}

function storagePath(value: unknown, bucket: string, form: 'path' | 'publicUrl'): string | null {
  if (typeof value !== 'string' || !value) return null
  if (form === 'path') return value
  const marker = `/storage/v1/object/public/${bucket}/`
  const at = value.indexOf(marker)
  return at === -1 ? null : decodeURIComponent(value.slice(at + marker.length).split('?')[0])
}

// Upload layouts: photo contest `${eventId}/${userId}/…` (api/photo-upload),
// community images `${eventId}/community/${userId}/…` (api/upload/community-image).
function isSubjectsObject(path: string, eventId: unknown, userId: string): boolean {
  if (typeof eventId !== 'string' || !eventId) return false
  if (path.split('/').some(seg => seg === '..' || seg === '.' || seg === '')) return false
  return path.startsWith(`${eventId}/${userId}/`) || path.startsWith(`${eventId}/community/${userId}/`)
}

async function applyRule(db: SupabaseClient, spec: ExportTable, subject: Subject, regIds: string[]) {
  const rule = spec.deleteRule
  const t = spec.table
  if (rule.action === 'keep' || rule.action === 'profile') return

  if (rule.action === 'delete' && !rule.storage) {
    // Straight to the filter: some tables (attendee_follows) have no id column.
    for (const filter of orFilters(spec.match, subject, regIds)) {
      const { error } = await db.from(t).delete().or(filter)
      check(t, error)
    }
    return
  }

  const rows = await readMatched(db, spec, subject, regIds)
  if (rows.length === 0) return

  if (rule.action === 'delete') {
    const { bucket, column, form } = rule.storage!
    // The path columns are attendee-writable (RLS lets a user write their own
    // row), so the service role removes only objects inside the subject's own
    // upload folders — never a path that merely claims to be theirs.
    const paths = rows
      .map(r => storagePath(r[column], bucket, form))
      .filter((p, i): p is string => {
        if (!p) return false
        if (isSubjectsObject(p, rows[i].event_id, subject.userId)) return true
        console.error('[gdpr delete] skipped storage object outside the subject folder', { table: t, id: rows[i].id })
        return false
      })
    for (const part of chunks(paths)) {
      const { error } = await db.storage.from(bucket).remove(part)
      check(`${t} (storage)`, error)
    }
    for (const part of chunks(rows.map(r => r.id))) {
      const { error } = await db.from(t).delete().in('id', part)
      check(t, error)
    }
    return
  }

  // anonymise
  if (rule.children) {
    const { table, fk, set } = rule.children
    for (const part of chunks(rows.map(r => r.id))) {
      const { error } = await db.from(table).update(valuesFor(set, { id: '' })).in(fk, part)
      check(table, error)
    }
  }
  const perRow = Object.values(rule.set).some(v => typeof v === 'function')
  if (perRow) {
    for (const row of rows) {
      const { error } = await db.from(t).update(valuesFor(rule.set, row)).eq('id', row.id)
      check(t, error)
    }
  } else {
    for (const part of chunks(rows.map(r => r.id))) {
      const { error } = await db.from(t).update(valuesFor(rule.set, { id: '' })).in('id', part)
      check(t, error)
    }
  }
}

// Objects whose path is derived from the subject, never read from a column:
// avatars at user-avatars/{userId}/avatar.{ext} (api/upload/avatar) and
// attendee photos at user-avatars/attendee-photos/{hmac(registrationId)}.{ext}
// (e/[slug]/profile/photo). Removing a path that does not exist is not an error.
function ownedObjects(subject: Subject, regIds: string[]): { bucket: string; paths: string[] }[] {
  const exts = ['jpg', 'png', 'webp']
  const paths = exts.map(e => `${subject.userId}/avatar.${e}`)
  const secret = process.env.EMBEDDED_SESSION_SECRET
  if (secret) {
    for (const id of regIds) {
      const hmac = createHmac('sha256', secret).update(id).digest('hex')
      for (const e of exts) paths.push(`attendee-photos/${hmac}.${e}`)
    }
  } else if (regIds.length > 0) {
    throw new StepError('attendee photos', 'EMBEDDED_SESSION_SECRET is not set; attendee photo paths cannot be derived')
  }
  return [{ bucket: 'user-avatars', paths }]
}

function escapeLike(v: string): string {
  return v.replace(/([\\%_])/g, '\\$1')
}

export async function deleteAccount(db: SupabaseClient, subject: Subject): Promise<DeleteAccountResult> {
  try {
    const orgs = await soleOwnedOrgs(db, subject.userId)
    if (orgs.length > 0) return { ok: false, reason: 'sole_owner', orgs }
    for (const { table, col } of GDPR_BLOCKING_REFERENCES) {
      const { count, error } = await db.from(table).select('id', { count: 'exact', head: true }).eq(col, subject.userId)
      check(`${table} (preflight)`, error)
      if ((count ?? 0) > 0) return { ok: false, reason: 'blocked', table }
    }

    // Registration ids first: registration-keyed tables are found through
    // them, and the registrations step renames the email they were found by.
    const registrations = await readMatched(db, GDPR_REGISTRATIONS, subject, [])
    const regIds = registrations.map(r => r.id)

    for (const { bucket, paths } of ownedObjects(subject, regIds)) {
      for (const part of chunks(paths)) {
        const { error } = await db.storage.from(bucket).remove(part)
        check(`${bucket} (storage)`, error)
      }
    }

    for (const spec of GDPR_EXPORT_TABLES) await applyRule(db, spec, subject, regIds)

    for (const ref of GDPR_ACTOR_REFERENCES) {
      const set = Object.fromEntries([ref.col, ...(ref.alsoNull ?? [])].map(c => [c, null]))
      if (ref.by === 'user') {
        const { error } = await db.from(ref.table).update(set).eq(ref.col, subject.userId)
        check(`${ref.table}.${ref.col}`, error)
      } else if (subject.email && !subject.email.includes('*')) {
        const { error } = await db.from(ref.table).update(set).ilike(ref.col, escapeLike(subject.email))
        check(`${ref.table}.${ref.col}`, error)
      }
    }

    await applyRule(db, GDPR_REGISTRATIONS, subject, [])

    // Cascades to profiles (and every CASCADE FK to profiles / auth.users).
    const { error: authErr } = await db.auth.admin.deleteUser(subject.userId)
    check('auth user', authErr)

    return { ok: true }
  } catch (e) {
    if (e instanceof StepError) return { ok: false, reason: 'failed', step: e.step, message: e.message }
    return { ok: false, reason: 'failed', step: 'unknown', message: e instanceof Error ? e.message : String(e) }
  }
}
