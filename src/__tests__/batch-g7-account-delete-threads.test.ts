// Batch G7 (O156 + O163, G-R7): deleting an account keeps the other people's
// threads. The subject's 1:1 and group messages become "[deleted]" with no
// sender; a conversation goes only when both participants are gone; the
// subject leaves their groups and a group left with no members goes; a group
// creator is no longer refused.
import { describe, it, expect, vi } from 'vitest'
import { createFakeDb } from './helpers/fake-db'

vi.mock('server-only', () => ({}))

import { deleteAccount } from '@/lib/gdpr/delete'
import { GDPR_EXPORT_TABLES, DELETED_MESSAGE } from '@/lib/gdpr/export'

const SUBJECT = { userId: 'u1', email: 'ann@x.com' }
process.env.EMBEDDED_SESSION_SECRET = 'test-secret'

function world() {
  return createFakeDb({
    profiles: [{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }],
    org_members: [],
    registrations: [],
    conversations: [
      // u1 ↔ u2: u2 keeps it.
      { id: 'cv1', event_id: 'e1', participant_a: 'u1', participant_b: 'u2' },
      // u3 ↔ u1 where u3 was already deleted: no one is left → removed.
      { id: 'cv2', event_id: 'e1', participant_a: null, participant_b: 'u1' },
      // Not the subject's.
      { id: 'cv3', event_id: 'e1', participant_a: 'u2', participant_b: 'u3' },
    ],
    messages: [
      { id: 'm1', conversation_id: 'cv1', sender_id: 'u1', body: 'hi Bob' },
      { id: 'm2', conversation_id: 'cv1', sender_id: 'u2', body: 'hi Ann' },
      { id: 'm3', conversation_id: 'cv3', sender_id: 'u2', body: 'other thread' },
    ],
    group_conversations: [
      { id: 'g1', event_id: 'e1', name: 'Team', created_by: 'u1' },     // created by u1, u2 stays
      { id: 'g2', event_id: 'e1', name: 'Pair', created_by: 'u2' },     // u1 was the only member
      { id: 'g3', event_id: 'e1', name: 'Others', created_by: 'u2' },   // not the subject's
    ],
    group_conversation_members: [
      { conversation_id: 'g1', user_id: 'u1' },
      { conversation_id: 'g1', user_id: 'u2' },
      { conversation_id: 'g2', user_id: 'u1' },
      { conversation_id: 'g3', user_id: 'u3' },
    ],
    group_messages: [
      { id: 'gm1', conversation_id: 'g1', sender_id: 'u1', body: 'I made this group' },
      { id: 'gm2', conversation_id: 'g1', sender_id: 'u2', body: 'thanks' },
      { id: 'gm3', conversation_id: 'g3', sender_id: 'u3', body: 'elsewhere' },
    ],
  }, { evalOr: true })
}

describe('account deletion and threads', () => {
  it('a group creator who sent 1:1 and group messages and is a group member deletes fully', async () => {
    const db = world()
    expect(await deleteAccount(db.client, SUBJECT)).toEqual({ ok: true })
    expect(db.deletedUsers).toEqual(['u1'])
    const T = db.tables

    // The other participant keeps the conversation; the subject is nulled.
    expect(T.conversations.find(c => c.id === 'cv1')).toMatchObject({ participant_a: null, participant_b: 'u2' })
    // Both participants gone → removed. Untouched otherwise.
    expect(T.conversations.map(c => c.id)).toEqual(['cv1', 'cv3'])

    // The subject's messages read "[deleted]" with no sender; the rest untouched.
    expect(T.messages.find(m => m.id === 'm1')).toMatchObject({ sender_id: null, body: DELETED_MESSAGE })
    expect(T.messages.find(m => m.id === 'm2')).toMatchObject({ sender_id: 'u2', body: 'hi Ann' })
    expect(T.messages.find(m => m.id === 'm3')).toMatchObject({ sender_id: 'u2', body: 'other thread' })

    // Groups: the subject left; g1 stays with a null creator; g2 had no one left.
    expect(T.group_conversation_members).toEqual([
      { conversation_id: 'g1', user_id: 'u2' },
      { conversation_id: 'g3', user_id: 'u3' },
    ])
    expect(T.group_conversations.map(g => [g.id, g.created_by])).toEqual([['g1', null], ['g3', 'u2']])
    expect(T.group_messages.find(m => m.id === 'gm1')).toMatchObject({ sender_id: null, body: DELETED_MESSAGE })
    expect(T.group_messages.find(m => m.id === 'gm2')).toMatchObject({ sender_id: 'u2', body: 'thanks' })
    expect(T.group_messages.find(m => m.id === 'gm3')).toMatchObject({ sender_id: 'u3', body: 'elsewhere' })
  })

  it('is safe to repeat', async () => {
    const db = world()
    await deleteAccount(db.client, SUBJECT)
    const again = createFakeDb(db.tables, { evalOr: true })
    expect(await deleteAccount(again.client, SUBJECT)).toEqual({ ok: true })
    expect(again.tables.conversations.map(c => c.id)).toEqual(['cv1', 'cv3'])
    expect(again.tables.group_conversations.map(g => g.id)).toEqual(['g1', 'g3'])
  })

  it('a failed empty-group read stops the run before any membership is removed', async () => {
    const db = world()
    const from = db.client.from
    db.client.from = ((t: string) => {
      const q = from(t)
      if (t !== 'group_conversation_members') return q
      const select = q.select
      q.select = (cols: string, opts?: { head?: boolean }) => opts?.head
        ? { eq: () => ({ neq: async () => ({ count: null, error: { message: 'boom' } }) }) }
        : select(cols, opts)
      return q
    }) as typeof from
    const res = await deleteAccount(db.client, SUBJECT)
    expect(res).toMatchObject({ ok: false, reason: 'failed', step: 'group_conversation_members (empty groups)' })
    expect(db.deletedUsers).toEqual([])
    expect(db.tables.group_conversation_members).toHaveLength(4)
  })

  it('a later failure does not strand a group only the subject was in; the retry completes', async () => {
    const db = createFakeDb(world().tables, { evalOr: true, failWrite: { conversations: { code: 'XX000', message: 'boom' } } })
    expect((await deleteAccount(db.client, SUBJECT)).ok).toBe(false)
    // g2 (the subject was its only member) was removed before the failure.
    expect(db.tables.group_conversations.map(g => g.id)).toEqual(['g1', 'g3'])
    const retry = createFakeDb(db.tables, { evalOr: true })
    expect(await deleteAccount(retry.client, SUBJECT)).toEqual({ ok: true })
    expect(retry.tables.group_conversations.map(g => [g.id, g.created_by])).toEqual([['g1', null], ['g3', 'u2']])
    expect(retry.tables.group_conversation_members).toEqual([
      { conversation_id: 'g1', user_id: 'u2' },
      { conversation_id: 'g3', user_id: 'u3' },
    ])
  })

  it('registry rules match the ruling', () => {
    const rule = (t: string) => GDPR_EXPORT_TABLES.find(x => x.table === t)!.deleteRule
    expect(rule('conversations')).toEqual({ action: 'release', columns: ['participant_a', 'participant_b'] })
    expect(rule('messages')).toEqual({ action: 'anonymise', set: { body: '[deleted]', sender_id: null } })
    expect(rule('group_messages')).toEqual({ action: 'anonymise', set: { body: '[deleted]', sender_id: null } })
    expect(rule('group_conversation_members')).toEqual({ action: 'delete' })
  })
})
