import { timingSafeEqual, createHash } from 'node:crypto'
import type { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'

const WEBHOOK_SECRET_HEADER = 'x-prezva-webhook-secret'

function secretsMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex')
}

export interface WebhookVerifyOptions {
  admin: SupabaseClient
  locationId: string | null | undefined
}

export interface WebhookVerifyResult {
  ok: boolean
  // Which credential actually verified. 'global' is the legacy path and is the
  // signal to watch while the per-location rollout drains — when it stops
  // appearing in logs, GHL_WEBHOOK_SECRET can be retired.
  via: 'per-location' | 'global' | null
}

// Shared secret check for the GHL webhook routes (GE-8 hardening — O41
// rotation complete 2026-07-21; R55 per-location secrets). The
// X-Prezva-Webhook-Secret header is the ONLY accepted transport — the legacy
// ?secret= query param is no longer honored, so the webhook secret can never
// appear in a URL (query strings land in access logs, browser history, and
// Referer headers).
//
// TWO-PHASE (R55). A location with a stored webhook_secret_hash verifies ONLY
// against that hash — the global env secret is REJECTED for it. That is the
// one-way door: every org that re-provisions permanently stops accepting the
// shared global credential, so a leak of the global secret cannot reach a
// migrated tenant, and the fallback population shrinks monotonically instead of
// lingering forever behind an OR.
//
// Called with no options (or with no resolvable location) it degrades to the
// pre-R55 global check, which is what keeps unparseable bodies and the
// not-yet-migrated refund workflow verifiable.
export async function verifyWebhookSecret(
  req: NextRequest,
  opts?: WebhookVerifyOptions,
): Promise<WebhookVerifyResult> {
  const provided = req.headers.get(WEBHOOK_SECRET_HEADER)
  if (!provided) return { ok: false, via: null }

  if (opts?.admin && opts.locationId) {
    const storedHash = await lookupLocationSecretHash(opts.admin, opts.locationId)
    if (storedHash) {
      // One-way door: this location has its own secret, so the global one is
      // not consulted at all, on match or mismatch.
      return { ok: secretsMatch(sha256Hex(provided), storedHash), via: 'per-location' }
    }
  }

  const expected = process.env.GHL_WEBHOOK_SECRET
  if (!expected) return { ok: false, via: null }

  const ok = secretsMatch(provided, expected)
  if (ok) {
    console.warn('[webhook-auth] global secret used', opts?.locationId ?? null)
  }
  return { ok, via: 'global' }
}

// Two narrow queries rather than getGhlOrgConfig: that function throws on any
// incomplete stage/field map, which would turn a half-provisioned org into a
// 500 on the authentication path instead of a clean fallback. Authentication
// must not depend on provisioning completeness.
async function lookupLocationSecretHash(
  admin: SupabaseClient,
  locationId: string,
): Promise<string | null> {
  try {
    const { data: link } = await admin
      .from('ghl_location_links')
      .select('org_id')
      .eq('ghl_location_id', locationId)
      .maybeSingle()
    if (!link?.org_id) return null

    const { data: config } = await admin
      .from('ghl_org_config')
      .select('webhook_secret_hash')
      .eq('org_id', link.org_id)
      .maybeSingle()

    return (config?.webhook_secret_hash as string | null | undefined) ?? null
  } catch (e) {
    // A DB hiccup must not silently downgrade a migrated location to the global
    // secret — that would re-open the door this design closes. Return null only
    // after saying so loudly; the caller's global path will then reject anything
    // that isn't the global secret anyway.
    console.error('[webhook-auth] secret hash lookup failed for location', locationId, e)
    return null
  }
}
