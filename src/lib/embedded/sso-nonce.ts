import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'

const NONCE_TTL_MS = 24 * 60 * 60 * 1000

export function hashSsoPayload(encrypted: string): string {
  return createHash('sha256').update(encrypted).digest('hex')
}

export type ClaimSsoNonceResult =
  | { ok: true }
  | { ok: false; reason: 'replay' | 'error' }

// Insert-first atomic claim: the payload_hash primary key is the concurrency
// guard, so two requests racing on the same payload can't both observe
// "not yet claimed" and proceed — only one insert can win.
export async function claimSsoNonce(payloadHash: string): Promise<ClaimSsoNonceResult> {
  const db = createAdminClient()
  const { error } = await db.from('sso_nonces').insert({ payload_hash: payloadHash })

  if (error) {
    if (error.code === '23505') return { ok: false, reason: 'replay' }
    console.error('[embedded-sso] nonce insert failed:', error.message)
    return { ok: false, reason: 'error' }
  }

  // Opportunistic TTL cleanup — not awaited on the response path; a failure
  // here is never fatal, it just leaves stale rows for the next successful claim.
  void db
    .from('sso_nonces')
    .delete()
    .lt('created_at', new Date(Date.now() - NONCE_TTL_MS).toISOString())
    .then(({ error: cleanupError }) => {
      if (cleanupError) console.error('[embedded-sso] nonce cleanup failed:', cleanupError.message)
    })

  return { ok: true }
}
