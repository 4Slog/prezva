import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id: eventId } = await params
    const { code, price_cents } = await req.json()

    if (!code) return NextResponse.json({ error: 'Code required' }, { status: 400 })

    const supabase = await createClient()
    const now = new Date().toISOString()

    const { data } = await supabase
      .from('discount_codes')
      .select('*')
      .eq('event_id', eventId)
      .eq('code', code.toUpperCase().trim())
      .eq('is_active', true)
      .maybeSingle()

    if (!data) return NextResponse.json({ valid: false, error: 'Invalid discount code' })
    if (data.valid_from && data.valid_from > now) {
      return NextResponse.json({ valid: false, error: 'Discount code not yet active' })
    }
    if (data.valid_until && data.valid_until < now) {
      return NextResponse.json({ valid: false, error: 'Discount code has expired' })
    }
    if (data.max_uses !== null && data.uses_count >= data.max_uses) {
      return NextResponse.json({ valid: false, error: 'Discount code has reached its limit' })
    }

    const discountAmount = data.discount_type === 'percent'
      ? Math.round((price_cents ?? 0) * data.discount_value / 100)
      : Math.min(price_cents ?? 0, data.discount_value)

    return NextResponse.json({
      valid: true,
      code: data.code,
      discountType:         data.discount_type,
      discountValue:        data.discount_value,
      discountAmountCents:  discountAmount,
    })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
