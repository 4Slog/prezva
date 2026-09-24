import { NextRequest, NextResponse } from 'next/server'
import { processOfflineQueue } from '@/lib/checkin/actions'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const result = await processOfflineQueue({ ...body, eventId: id })
    // R84: a batch-level refusal is non-OK, so the device leaves every entry
    // pending. Per-entry outcomes arrive in `results` on a 200.
    if ('error' in result) return NextResponse.json(result, { status: 400 })
    return NextResponse.json(result)
  } catch (err) {
    // Includes an expired session (requireUser's redirect, or no embed
    // session): non-OK, so nothing on the device changes.
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Sync failed' }, { status: 400 })
  }
}
