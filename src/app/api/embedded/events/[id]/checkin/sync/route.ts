import { NextRequest, NextResponse } from 'next/server'
import { processOfflineQueue } from '@/lib/embedded/checkin-actions'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const result = await processOfflineQueue({ eventId: id, ...body })
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}
