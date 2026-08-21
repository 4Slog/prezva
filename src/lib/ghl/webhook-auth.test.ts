// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHash } from 'node:crypto'
import { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'

import { verifyWebhookSecret } from './webhook-auth'

const GLOBAL_SECRET = 'global-shared-secret-32-chars-lng'
const LOCATION_SECRET = 'per-location-secret-64-hex-ish-value'
const LOCATION_ID = 'loc-abc'
const ORG_ID = 'org-abc'

function sha256Hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex')
}

function makeRequest(secret: string | null): NextRequest {
  const headers: Record<string, string> = {}
  if (secret !== null) headers['X-Prezva-Webhook-Secret'] = secret
  return new NextRequest('http://localhost/api/ghl/webhooks/payment', { method: 'POST', headers })
}

// Table-dispatch admin stub. linkOrgId null => the location resolves to no org;
// storedHash null => the org row exists but carries no per-location secret.
function makeAdmin(opts: { linkOrgId?: string | null; storedHash?: string | null; throwOn?: string }) {
  const from = vi.fn((table: string) => {
    if (opts.throwOn === table) throw new Error('db exploded')
    const chain: Record<string, unknown> = {}
    chain.select = vi.fn().mockReturnValue(chain)
    chain.eq = vi.fn().mockReturnValue(chain)
    chain.maybeSingle = vi.fn().mockResolvedValue(
      table === 'ghl_location_links'
        ? { data: opts.linkOrgId === null ? null : { org_id: opts.linkOrgId ?? ORG_ID }, error: null }
        : { data: opts.storedHash === undefined ? null : { webhook_secret_hash: opts.storedHash }, error: null },
    )
    return chain
  })
  return { from } as unknown as SupabaseClient
}

beforeEach(() => {
  vi.stubEnv('GHL_WEBHOOK_SECRET', GLOBAL_SECRET)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('verifyWebhookSecret — per-location phase', () => {
  it('accepts the correct per-location secret against the stored hash', async () => {
    const admin = makeAdmin({ storedHash: sha256Hex(LOCATION_SECRET) })

    const result = await verifyWebhookSecret(makeRequest(LOCATION_SECRET), { admin, locationId: LOCATION_ID })

    expect(result).toEqual({ ok: true, via: 'per-location' })
  })

  it('rejects a wrong secret when a hash is stored', async () => {
    const admin = makeAdmin({ storedHash: sha256Hex(LOCATION_SECRET) })

    const result = await verifyWebhookSecret(makeRequest('not-the-right-secret'), { admin, locationId: LOCATION_ID })

    expect(result).toEqual({ ok: false, via: 'per-location' })
  })

  // ── THE SECURITY PROPERTY OF R55 ──────────────────────────────────────────
  // This is the one-way door. Once a location stores its own hash, the global
  // shared secret must stop working FOR THAT LOCATION — otherwise the migration
  // buys nothing, because a leaked global secret would still authenticate
  // against every migrated tenant. If this test ever goes green-to-red, the
  // fallback has silently become an OR again and the whole batch is void.
  it('REJECTS the global secret for a location that has its own stored hash (one-way door)', async () => {
    const admin = makeAdmin({ storedHash: sha256Hex(LOCATION_SECRET) })

    const result = await verifyWebhookSecret(makeRequest(GLOBAL_SECRET), { admin, locationId: LOCATION_ID })

    expect(result.ok).toBe(false)
    // via must be 'per-location': proof the global branch was never consulted,
    // not merely that the comparison happened to fail.
    expect(result.via).toBe('per-location')
  })

  it('does not consult the global secret even when the env value is unset for a hashed location', async () => {
    vi.stubEnv('GHL_WEBHOOK_SECRET', '')
    const admin = makeAdmin({ storedHash: sha256Hex(LOCATION_SECRET) })

    const result = await verifyWebhookSecret(makeRequest(LOCATION_SECRET), { admin, locationId: LOCATION_ID })

    expect(result).toEqual({ ok: true, via: 'per-location' })
  })
})

describe('verifyWebhookSecret — global fallback phase', () => {
  it('falls back to the global secret when the org row stores no hash, and logs loudly', async () => {
    const admin = makeAdmin({ storedHash: null })

    const result = await verifyWebhookSecret(makeRequest(GLOBAL_SECRET), { admin, locationId: LOCATION_ID })

    expect(result).toEqual({ ok: true, via: 'global' })
    expect(console.warn).toHaveBeenCalledWith('[webhook-auth] global secret used', LOCATION_ID)
  })

  it('falls back to global when the location resolves to no org at all', async () => {
    const admin = makeAdmin({ linkOrgId: null })

    const result = await verifyWebhookSecret(makeRequest(GLOBAL_SECRET), { admin, locationId: LOCATION_ID })

    expect(result).toEqual({ ok: true, via: 'global' })
  })

  it('falls back to global when called with no options at all (unparseable body path)', async () => {
    const result = await verifyWebhookSecret(makeRequest(GLOBAL_SECRET))

    expect(result).toEqual({ ok: true, via: 'global' })
  })

  it('rejects a wrong secret on the global path', async () => {
    const result = await verifyWebhookSecret(makeRequest('wrong'))

    expect(result.ok).toBe(false)
    expect(console.warn).not.toHaveBeenCalled()
  })

  it('rejects when no secret header is present, without touching the database', async () => {
    const admin = makeAdmin({ storedHash: sha256Hex(LOCATION_SECRET) })

    const result = await verifyWebhookSecret(makeRequest(null), { admin, locationId: LOCATION_ID })

    expect(result).toEqual({ ok: false, via: null })
    expect(admin.from).not.toHaveBeenCalled()
  })

  it('rejects when neither a stored hash nor a global env secret exists', async () => {
    vi.stubEnv('GHL_WEBHOOK_SECRET', '')
    const admin = makeAdmin({ storedHash: null })

    const result = await verifyWebhookSecret(makeRequest('anything'), { admin, locationId: LOCATION_ID })

    expect(result).toEqual({ ok: false, via: null })
  })

  it('a lookup failure logs and degrades to global rather than throwing', async () => {
    const admin = makeAdmin({ throwOn: 'ghl_location_links' })

    const result = await verifyWebhookSecret(makeRequest(GLOBAL_SECRET), { admin, locationId: LOCATION_ID })

    expect(result).toEqual({ ok: true, via: 'global' })
    expect(console.error).toHaveBeenCalled()
  })
})
