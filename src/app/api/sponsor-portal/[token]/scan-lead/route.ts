import { NextRequest, NextResponse } from 'next/server'
import { scanLead } from '@/lib/sponsors/portal-actions'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const body = await req.json()
  const { qr_code, note, contact_name } = body
  if (!qr_code) return NextResponse.json({ error: 'qr_code required' }, { status: 400 })
  const result = await scanLead(token, qr_code, note, contact_name)
  if (result.error) return NextResponse.json(result, { status: 400 })
  return NextResponse.json(result)
}
