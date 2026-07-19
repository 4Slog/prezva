// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

import { ghlAdapter } from './adapter'
import { createAdminClient } from '@/lib/supabase/admin'
import { encryptToken } from '../_shared/encryption'

// Mirrors the sequential-response admin mock in
// src/app/api/ghl/webhooks/payment/route.test.ts — makes the exact DB call
// order in the adapter explicit rather than a loose catch-all mock.
function makeSequentialClient(responses: Array<{ data: unknown; error?: unknown }>) {
  let idx = 0
  return {
    from: vi.fn().mockImplementation(() => {
      const resp = responses[idx++] ?? { data: null, error: null }
      const chain: Record<string, unknown> = {}
      chain.select = vi.fn().mockReturnValue(chain)
      chain.eq = vi.fn().mockReturnValue(chain)
      chain.upsert = vi.fn().mockReturnValue(chain)
      chain.update = vi.fn().mockReturnValue(chain)
      chain.delete = vi.fn().mockReturnValue(chain)
      chain.maybeSingle = vi.fn().mockResolvedValue(resp)
      chain.single = vi.fn().mockResolvedValue(resp)
      return chain
    }),
  }
}

const ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')

describe('ghlAdapter', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('GHL_CLIENT_ID', 'test-client-id')
    vi.stubEnv('GHL_CLIENT_SECRET', 'test-client-secret')
    vi.stubEnv('INTEGRATION_ENCRYPTION_KEY', ENCRYPTION_KEY)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  describe('handleCallback', () => {
    it('Location response: writes org_integrations and ghl_location_links', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'access-123',
          refresh_token: 'refresh-123',
          expires_in: 3600,
          userType: 'Location',
          locationId: 'loc-1',
          companyId: 'company-1',
        }),
      })

      const client = makeSequentialClient([
        { data: null, error: null },
        { data: null, error: null },
      ])
      vi.mocked(createAdminClient).mockReturnValue(client as any)

      await ghlAdapter.handleCallback('auth-code', 'org-1', 'https://prezva.app/api/oauth/callback')

      expect(client.from).toHaveBeenNthCalledWith(1, 'org_integrations')
      const orgIntegrationsChain = client.from.mock.results[0].value as any
      expect(orgIntegrationsChain.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ org_id: 'org-1', provider: 'ghl', status: 'connected' }),
        { onConflict: 'org_id,provider' },
      )

      expect(client.from).toHaveBeenNthCalledWith(2, 'ghl_location_links')
      const locationChain = client.from.mock.results[1].value as any
      expect(locationChain.upsert).toHaveBeenCalledWith(
        { ghl_location_id: 'loc-1', org_id: 'org-1', ghl_account_id: 'company-1' },
        { onConflict: 'ghl_location_id' },
      )
    })

    it('Company response: writes org_integrations only, no location enumeration', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'access-agency',
          refresh_token: 'refresh-agency',
          expires_in: 3600,
          userType: 'Company',
          companyId: 'company-9',
        }),
      })

      const client = makeSequentialClient([{ data: null, error: null }])
      vi.mocked(createAdminClient).mockReturnValue(client as any)
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      await ghlAdapter.handleCallback('auth-code', 'org-2', 'https://prezva.app/api/oauth/callback')

      expect(client.from).toHaveBeenCalledTimes(1)
      expect(client.from).toHaveBeenCalledWith('org_integrations')
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('deferred to Batch 3'))

      logSpy.mockRestore()
    })
  })

  describe('getAccessToken', () => {
    it('returns the cached access token when outside the refresh skew', async () => {
      const encryptedAccess = encryptToken('cached-access-token')!
      const farFuture = new Date(Date.now() + 60 * 60 * 1000).toISOString()

      const client = makeSequentialClient([
        {
          data: {
            encrypted_access_token: encryptedAccess,
            encrypted_refresh_token: 'irrelevant',
            token_expires_at: farFuture,
          },
          error: null,
        },
      ])
      vi.mocked(createAdminClient).mockReturnValue(client as any)

      const token = await ghlAdapter.getAccessToken('org-1')

      expect(token).toBe('cached-access-token')
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('refreshes when within the 2-minute skew and persists the new tokens', async () => {
      const encryptedAccess = encryptToken('stale-access-token')!
      const encryptedRefresh = encryptToken('refresh-token-value')!
      const soon = new Date(Date.now() + 60 * 1000).toISOString()

      const client = makeSequentialClient([
        {
          data: {
            encrypted_access_token: encryptedAccess,
            encrypted_refresh_token: encryptedRefresh,
            token_expires_at: soon,
          },
          error: null,
        },
        { data: null, error: null },
      ])
      vi.mocked(createAdminClient).mockReturnValue(client as any)

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'fresh-access-token',
          refresh_token: 'fresh-refresh-token',
          expires_in: 3600,
        }),
      })

      const token = await ghlAdapter.getAccessToken('org-1')

      expect(token).toBe('fresh-access-token')
      expect(fetchMock).toHaveBeenCalledWith(
        'https://services.leadconnectorhq.com/oauth/token',
        expect.objectContaining({ method: 'POST' }),
      )

      const updateChain = client.from.mock.results[1].value as any
      expect(updateChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          encrypted_access_token: expect.any(String),
          encrypted_refresh_token: expect.any(String),
          token_expires_at: expect.any(String),
        }),
      )
    })
  })
})
