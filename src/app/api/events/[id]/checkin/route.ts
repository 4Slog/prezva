import { NextRequest, NextResponse } from 'next/server'
import { checkInByQR } from '@/lib/checkin/actions'
import { checkRateLimit, checkinLimiter } from '@/lib/ratelimit'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
    const { limited } = await checkRateLimit(checkinLimiter, ip)
    if (limited) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

    const { id } = await params
    const body = await req.json()
    const { qr_code, device_id } = body
    if (!qr_code) return NextResponse.json({ error: 'qr_code required' }, { status: 400 })
    const result = await checkInByQR(id, qr_code, device_id ?? 'web')
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}
