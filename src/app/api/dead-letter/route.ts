import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'

const Schema = z.object({
  type:     z.string(),
  payload:  z.record(z.string(), z.unknown()),
  error:    z.string().optional(),
  event_id: z.string().uuid().optional(),
})

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const parsed = Schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }
    // Admin client: write dead-letter item (called from background job / check-in sync)
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('dead_letter_items')
      .insert({
        type:          parsed.data.type,
        payload:       parsed.data.payload,
        error_message: parsed.data.error ?? null,
        event_id:      parsed.data.event_id ?? null,
      })
      .select('id')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ id: data.id })
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
