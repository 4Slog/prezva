import { NextRequest, NextResponse } from 'next/server'
import { processOfflineSessionQueue as run } from '@/lib/checkin/actions'

// M3b: drains a device's queued session check-ins. The URL ids win over any in
// the body. A batch-level failure is non-OK so the device leaves every entry
// pending; 401 { code: 'session_expired' } tells staff to reopen the page.
// Per-entry outcomes arrive in `results` on a 200.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> },
) {
  try {
    const { id, sessionId } = await params
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    const result = await run(id, sessionId, body)
    if ('error' in result) {
      const { status, ...rest } = result
      return NextResponse.json(rest, { status })
    }
    return NextResponse.json(result)
  } catch (err) {
    console.error('[checkin] session sync failed:', err)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}
