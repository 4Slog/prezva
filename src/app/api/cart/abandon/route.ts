import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const { event_id, email, ticket_type_id } = await request.json()
    if (!event_id || !email) return NextResponse.json({ ok: false }, { status: 400 })

    const supabase = await createClient()
    await supabase.from('abandoned_carts').upsert(
      { event_id, email: email.toLowerCase(), ticket_type_id: ticket_type_id ?? null },
      { onConflict: 'event_id,email' },
    )

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
