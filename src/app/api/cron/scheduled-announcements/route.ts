import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { headers } from 'next/headers'

export async function GET() {
  const headersList = await headers()
  const authHeader = headersList.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const now = new Date().toISOString()

  const { data: due, error } = await admin
    .from('announcements')
    .select('id, event_id, title, channel')
    .eq('status', 'scheduled')
    .lte('scheduled_for', now)
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!due?.length) return NextResponse.json({ processed: 0 })

  const results = await Promise.allSettled(
    due.map((a) =>
      admin
        .from('announcements')
        .update({ status: 'sending' })
        .eq('id', a.id)
        .eq('status', 'scheduled')
    )
  )

  return NextResponse.json({
    processed: due.length,
    queued: results.filter((r) => r.status === 'fulfilled').length,
  })
}

export const runtime = 'nodejs'
