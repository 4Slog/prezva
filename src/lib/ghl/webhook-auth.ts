import { timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'

const WEBHOOK_SECRET_HEADER = 'x-prezva-webhook-secret'

function secretsMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

// Shared secret check for the GHL webhook routes (GE-8 hardening — O41
// rotation complete 2026-07-21). The X-Prezva-Webhook-Secret header is the
// ONLY accepted transport — the legacy ?secret= query param is no longer
// honored, so the webhook secret can never appear in a URL (query strings
// land in access logs, browser history, and Referer headers).
export function verifyWebhookSecret(req: NextRequest): boolean {
  const provided = req.headers.get(WEBHOOK_SECRET_HEADER)
  const expected = process.env.GHL_WEBHOOK_SECRET
  if (!provided || !expected) return false
  return secretsMatch(provided, expected)
}
