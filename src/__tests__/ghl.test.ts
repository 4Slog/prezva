import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null }) }) }) }),
    }),
  }),
}))

describe('GHL adapter', () => {
  beforeEach(() => {
    delete process.env.GHL_CLIENT_ID
    delete process.env.GHL_CLIENT_SECRET
  })

  it('isConfigured() returns false when env vars absent', async () => {
    const { ghlAdapter } = await import('@/lib/integrations/ghl/adapter')
    expect(ghlAdapter.isConfigured()).toBe(false)
  })

  it('isConfigured() returns true when both env vars set', async () => {
    process.env.GHL_CLIENT_ID = 'test-id'
    process.env.GHL_CLIENT_SECRET = 'test-secret'
    const { ghlAdapter } = await import('@/lib/integrations/ghl/adapter')
    expect(ghlAdapter.isConfigured()).toBe(true)
  })

  it('getAuthUrl() includes client_id, scope, and state', async () => {
    process.env.GHL_CLIENT_ID = 'my-client-id'
    const { ghlAdapter } = await import('@/lib/integrations/ghl/adapter')
    const url = ghlAdapter.getAuthUrl('org-1', 'https://prezva.app/api/oauth/callback', 'state-abc')
    expect(url).toContain('client_id=my-client-id')
    expect(url).toContain('scope=')
    expect(url).toContain('state=state-abc')
    expect(url).toContain('marketplace.gohighlevel.com')
  })

  it('getStatus() returns awaiting_credentials when not configured', async () => {
    const { ghlAdapter } = await import('@/lib/integrations/ghl/adapter')
    const status = await ghlAdapter.getStatus('org-1')
    expect(status).toBe('awaiting_credentials')
  })
})
