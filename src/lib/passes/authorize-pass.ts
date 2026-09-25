import 'server-only'

import { timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

function sameToken(a: string, b: string) {
  const x = Buffer.from(a, 'utf8')
  const y = Buffer.from(b, 'utf8')
  return x.length === y.length && timingSafeEqual(x, y)
}

export type PassAuthorization =
  | { ok: true; registrationId: string }
  | { ok: false; status: 403 | 404; error: string }

// One gate for every wallet-pass route (Apple and Google). A pass carries the
// attendee's check-in QR, so it is issued only to someone holding that
// registration's own qr_code token (?t=, compared in constant time) or to the
// signed-in owner (linked by user_id, or by their verified email) — and only
// for a confirmed registration. Strangers get the same 404 whether or not the
// registration exists; the status is revealed only to an authorized caller.
export async function authorizePassRequest(registrationId: string, token: string | null): Promise<PassAuthorization> {
  const admin = createAdminClient()
  const { data: reg } = await admin
    .from('registrations')
    .select('id, qr_code, user_id, attendee_email, status')
    .eq('id', registrationId)
    .maybeSingle()
  if (!reg) return { ok: false, status: 404, error: 'Not found' }

  let allowed = !!token && !!reg.qr_code && sameToken(token, reg.qr_code as string)
  if (!allowed) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    allowed = !!user && (
      reg.user_id === user.id ||
      (!!user.email && !!reg.attendee_email && user.email.toLowerCase() === (reg.attendee_email as string).toLowerCase())
    )
  }
  if (!allowed) return { ok: false, status: 404, error: 'Not found' }

  if (reg.status !== 'confirmed') {
    return { ok: false, status: 403, error: 'This registration is not active, so no pass can be issued.' }
  }
  return { ok: true, registrationId: reg.id as string }
}
