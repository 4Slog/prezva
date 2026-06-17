import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const reg = req.nextUrl.searchParams.get('reg')
  const next = req.nextUrl.searchParams.get('next')

  if (!reg || !UUID_RE.test(reg)) {
    return NextResponse.redirect(new URL(`/e/${slug}`, req.nextUrl.origin))
  }

  const admin = createAdminClient()

  const { data: event } = await admin
    .from('events')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()

  if (!event) {
    return NextResponse.redirect(new URL('/', req.nextUrl.origin))
  }

  const { data: registration } = await admin
    .from('registrations')
    .select('id, event_id, status')
    .eq('id', reg)
    .maybeSingle()

  if (
    !registration ||
    registration.status !== 'confirmed' ||
    registration.event_id !== event.id
  ) {
    return NextResponse.redirect(new URL(`/e/${slug}`, req.nextUrl.origin))
  }

  // Open-redirect guard: only honour `next` if it stays within this event's path
  const target = next && next.startsWith(`/e/${slug}`) ? next : `/e/${slug}`

  const res = NextResponse.redirect(new URL(target, req.nextUrl.origin))
  res.cookies.set(`pz_reg_${slug}`, reg, {
    path: `/e/${slug}`,
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 90,
  })
  return res
}
