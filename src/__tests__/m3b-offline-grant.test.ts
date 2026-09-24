// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { SignJWT } from 'jose'

// M3b-A — the offline staff grant (R88) and the 0151 migration (R87).

beforeAll(() => {
  process.env.EMBEDDED_SESSION_SECRET = 'test-embedded-session-secret-at-least-32-bytes'
})

import {
  mintOfflineGrant,
  verifyOfflineGrant,
  grantExpiry,
  grantScanFloor,
  OFFLINE_GRANT_AUDIENCE,
  type OfflineGrantClaims,
} from '@/lib/checkin/offline-grant'
import { mintEmbeddedSession, verifyEmbeddedSession } from '@/lib/embedded/session'

const EVENT = 'e1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
const SESSION = '5e5510e0-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
const ORG = 'c1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
const USER = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'

const claims: OfflineGrantClaims = {
  surface: 'dashboard', eventId: EVENT, sessionId: SESSION, orgId: ORG, userId: USER, email: null,
}
const expected = { surface: 'dashboard' as const, eventId: EVENT, sessionId: SESSION }
const inHours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString()

describe('offline grant', () => {
  it('a valid grant verifies and returns its claims and issue time', async () => {
    const token = await mintOfflineGrant(claims, inHours(4))
    const grant = await verifyOfflineGrant(token, expected)
    expect(grant).toEqual(expect.objectContaining(claims))
    expect(Math.abs(grant!.issuedAt.getTime() - Date.now())).toBeLessThan(2_000)
    expect(grantScanFloor(grant!).getTime()).toBe(grant!.issuedAt.getTime() - 5 * 60_000)
  })

  it('embedded claims carry the email and a null member id', async () => {
    const embed = { ...claims, surface: 'embed' as const, userId: null, email: 'door@org.test' }
    const grant = await verifyOfflineGrant(await mintOfflineGrant(embed, null), { ...expected, surface: 'embed' })
    expect(grant).toEqual(expect.objectContaining({ userId: null, email: 'door@org.test' }))
  })

  it('an expired grant is rejected', async () => {
    // The event ended 3 days ago → exp = end + 24h, already past.
    const token = await mintOfflineGrant(claims, inHours(-72))
    expect(await verifyOfflineGrant(token, expected)).toBeNull()
  })

  it('a wrong audience is rejected even when signed with the derived key', async () => {
    // The spec'd derivation: HKDF-SHA256(secret, salt empty, info 'prezva-offline-grant-v1').
    const enc = new TextEncoder()
    const base = await crypto.subtle.importKey('raw', enc.encode(process.env.EMBEDDED_SESSION_SECRET), 'HKDF', false, ['deriveBits'])
    const key = new Uint8Array(await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: enc.encode('prezva-offline-grant-v1') }, base, 256))
    const sign = (aud: string) => new SignJWT({ ...claims })
      .setProtectedHeader({ alg: 'HS256' }).setAudience(aud).setIssuedAt().setExpirationTime('1h').sign(key)
    expect(await verifyOfflineGrant(await sign(OFFLINE_GRANT_AUDIENCE), expected)).not.toBeNull()
    expect(await verifyOfflineGrant(await sign('other'), expected)).toBeNull()
  })

  it('a grant for another event or another session is rejected', async () => {
    const token = await mintOfflineGrant(claims, inHours(4))
    expect(await verifyOfflineGrant(token, { ...expected, eventId: ORG })).toBeNull()
    expect(await verifyOfflineGrant(token, { ...expected, sessionId: USER })).toBeNull()
  })

  it('a grant for the other surface is rejected', async () => {
    const token = await mintOfflineGrant(claims, inHours(4))
    expect(await verifyOfflineGrant(token, { ...expected, surface: 'embed' })).toBeNull()
  })

  it('an embed session token is rejected as a grant (different key)', async () => {
    const embedToken = await mintEmbeddedSession('loc_1', 'door@org.test')
    expect(await verifyOfflineGrant(embedToken, expected)).toBeNull()
  })

  it('a token signed with the raw secret and the grant audience is still rejected', async () => {
    const raw = new TextEncoder().encode(process.env.EMBEDDED_SESSION_SECRET)
    const forged = await new SignJWT({ ...claims })
      .setProtectedHeader({ alg: 'HS256' }).setAudience(OFFLINE_GRANT_AUDIENCE)
      .setIssuedAt().setExpirationTime('1h').sign(raw)
    expect(await verifyOfflineGrant(forged, expected)).toBeNull()
  })

  it('a grant is rejected as an embed session', async () => {
    const token = await mintOfflineGrant(claims, inHours(4))
    await expect(verifyEmbeddedSession(token)).rejects.toThrow()
  })
})

describe('grantExpiry', () => {
  const now = new Date('2026-09-24T12:00:00.000Z')
  it('is the event end + 24h', () => {
    expect(grantExpiry('2026-09-25T20:00:00.000Z', now).toISOString()).toBe('2026-09-26T20:00:00.000Z')
  })
  it('is now + 24h when the event has no end', () => {
    expect(grantExpiry(null, now).toISOString()).toBe('2026-09-25T12:00:00.000Z')
  })
  it('is capped at now + 7 days', () => {
    expect(grantExpiry('2026-12-01T00:00:00.000Z', now).toISOString()).toBe('2026-10-01T12:00:00.000Z')
  })
})

describe('migration 0151 (R87)', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/0151_check_ins_offline_columns.sql'), 'utf-8')
  it.each([
    'is_offline boolean NOT NULL DEFAULT false',
    'client_scanned_at timestamptz NULL',
    'client_entry_id uuid NULL',
  ])('adds check_ins.%s', (col) => {
    expect(sql).toContain(`ADD COLUMN IF NOT EXISTS ${col}`)
  })
  it('adds a partial unique index on client_entry_id', () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX[\s\S]*\(client_entry_id\) WHERE client_entry_id IS NOT NULL/)
  })
  it('does not touch the checked_in_source CHECK', () => {
    expect(sql).not.toMatch(/checked_in_source_check|DROP CONSTRAINT/i)
  })
})
