import 'server-only'

import { timingSafeEqual } from 'node:crypto'

// Internal (machine-to-machine) routes authenticate with CRON_SECRET sent as
// `Authorization: Bearer <secret>` — the header Vercel Cron attaches. Compared
// timing-safe; fails closed when the secret is unset.
export function hasInternalSecret(req: Request): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  const header = req.headers.get('authorization') ?? ''
  const provided = header.startsWith('Bearer ') ? header.slice(7) : ''
  const a = Buffer.from(provided, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}
