import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { generateGoogleWalletUrl } from '@/lib/passes/google-wallet'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

function sameToken(a: string, b: string) {
  const x = Buffer.from(a, 'utf8')
  const y = Buffer.from(b, 'utf8')
  return x.length === y.length && timingSafeEqual(x, y)
}

// A pass carries the attendee's check-in QR, so it is issued only to someone
// holding that registration's own qr_code token (?t=), or to the signed-in
// owner (linked by user_id, or by their verified email).
export async function GET(req: NextRequest, { params }: { params: Promise<{ registrationId: string }> }) {
  const { registrationId } = await params
  const token = req.nextUrl.searchParams.get('t') ?? ''

  const admin = createAdminClient()
  const { data: reg } = await admin
    .from('registrations')
    .select('id, qr_code, user_id, attendee_email')
    .eq('id', registrationId)
    .maybeSingle()
  if (!reg) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let allowed = !!token && !!reg.qr_code && sameToken(token, reg.qr_code as string)
  if (!allowed) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    allowed = !!user && (
      reg.user_id === user.id ||
      (!!user.email && !!reg.attendee_email && user.email.toLowerCase() === (reg.attendee_email as string).toLowerCase())
    )
  }
  if (!allowed) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const result = await generateGoogleWalletUrl(reg.id)

  if (result.error) {
    const status = result.error === 'Google Wallet not configured' ? 501 : 400
    return NextResponse.json({ error: result.error }, { status })
  }

  return NextResponse.redirect(result.url!)
}
