import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const query = req.nextUrl.searchParams.get('q')?.trim()
  if (!query || query.length < 2) return NextResponse.json({ results: [] })

  const admin = createAdminClient()

  const { data: vol } = await admin
    .from('volunteers')
    .select('id, role, event_id')
    .eq('portal_access_token', token)
    .single()

  if (!vol) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { data: regs } = await admin
    .from('registrations')
    .select('id, attendee_name, attendee_email, status, checked_in_at, ticket_types(name)')
    .eq('event_id', (vol as any).event_id)
    .or(`attendee_name.ilike.%${query}%,attendee_email.ilike.%${query}%`)
    .in('status', ['confirmed', 'checked_in', 'pending'])
    .limit(10)

  const results = ((regs ?? []) as any[]).map(r => ({
    id: r.id,
    name: r.attendee_name,
    email: r.attendee_email,
    status: r.status,
    ticket: r.ticket_types?.name,
    checked_in: !!r.checked_in_at,
  }))

  return NextResponse.json({ results })
}
