import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { searchParams, origin } = new URL(req.url)
  const token = searchParams.get('t')
  const rawNext = searchParams.get('next')
  const next = rawNext && rawNext.startsWith(`/e/${slug}`) ? rawNext : `/e/${slug}`

  const fail = () => NextResponse.redirect(new URL(`/e/${slug}`, origin))
  if (!token) return fail()

  const admin = createAdminClient()
  const { data: event } = await admin.from('events').select('id').eq('slug', slug).maybeSingle()
  if (!event) return fail()

  const { data: registration } = await admin
    .from('registrations')
    .select('id, event_id, status, attendee_email')
    .eq('app_access_token', token)
    .maybeSingle()

  if (!registration || registration.status !== 'confirmed' || registration.event_id !== event.id) {
    return fail()
  }

  const claimFallback = () =>
    NextResponse.redirect(new URL(`/e/${slug}/enter?reg=${registration.id}`, origin))

  if (!registration.attendee_email) return claimFallback()

  const service = createServiceClient()
  const { data: linkData, error } = await service.auth.admin.generateLink({
    type: 'magiclink',
    email: registration.attendee_email,
    options: { redirectTo: `${origin}/auth/confirm` },
  })
  const tokenHash = linkData?.properties?.hashed_token
  const otpType = linkData?.properties?.verification_type
  if (error || !tokenHash || !otpType) return claimFallback()

  const confirmUrl = new URL('/auth/confirm', origin)
  confirmUrl.searchParams.set('token_hash', tokenHash)
  confirmUrl.searchParams.set('type', otpType)
  confirmUrl.searchParams.set('next', next)
  return NextResponse.redirect(confirmUrl)
}
