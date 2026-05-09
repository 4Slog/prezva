import { NextRequest, NextResponse } from 'next/server'
import { getCheckInStats } from '@/lib/checkin/actions'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const stats = await getCheckInStats(id)
    return NextResponse.json(stats)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}
