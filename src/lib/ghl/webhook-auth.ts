import { timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'

const WEBHOOK_SECRET_HEADER = 'x-prezva-webhook-secret'

function secretsMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

// Shared secret check for the GHL webhook routes (GE-8 hardening — rotation
// step 1 of 2). Accepts the secret via the X-Prezva-Webhook-Secret header
// (checked first) or the legacy ?secret= query param. Query-param support is
// transitional: it stays until the GHL workflow actions are migrated to send
// the header, then gets removed in a later commit once Paul rotates
// GHL_WEBHOOK_SECRET.
export function verifyWebhookSecret(req: NextRequest): boolean {
  const provided = req.headers.get(WEBHOOK_SECRET_HEADER) ?? req.nextUrl.searchParams.get('secret')
  const expected = process.env.GHL_WEBHOOK_SECRET
  if (!provided || !expected) return false
  return secretsMatch(provided, expected)
}
