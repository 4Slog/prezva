import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token') ?? ''
  const type = searchParams.get('type') ?? 'announcements'

  let regId: string
  try {
    regId = Buffer.from(token, 'base64url').toString('utf8')
  } catch {
    return htmlResponse('Invalid unsubscribe link.')
  }

  const admin = createAdminClient()
  const { data: reg } = await admin
    .from('registrations')
    .select('id, user_id')
    .eq('id', regId)
    .maybeSingle()

  if (!reg) return htmlResponse('Invalid unsubscribe link.')

  if ((reg as any).user_id) {
    const updates: Record<string, boolean> = {}
    if (type === 'announcements') updates.email_announcements = false
    else if (type === 'reminders') updates.email_reminders = false
    else if (type === 'all') {
      updates.email_announcements = false
      updates.email_reminders = false
      updates.email_surveys = false
      updates.email_marketing = false
    }

    await admin
      .from('attendee_preferences')
      .upsert({ user_id: (reg as any).user_id, ...updates, updated_at: new Date().toISOString() })
  }

  const label =
    type === 'all' ? 'all event emails' :
    type === 'reminders' ? 'reminder emails' :
    'announcement emails'

  return htmlResponse(`You've been unsubscribed from ${label}.`)
}

function htmlResponse(message: string) {
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><title>Unsubscribed</title>
    <style>body{font-family:sans-serif;background:#0D1B2A;color:#CBD5E1;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;}
    .card{background:#112240;border-radius:12px;padding:2rem 2.5rem;max-width:420px;text-align:center;}
    h1{color:#00BFA6;font-size:1.25rem;}p{color:#94A3B8;font-size:14px;}
    a{color:#00BFA6;}</style></head>
    <body><div class="card">
    <h1>✓ Unsubscribed</h1>
    <p>${message}</p>
    <p style="margin-top:1.5rem"><a href="https://prezva.app">← Return to Prezva</a></p>
    </div></body></html>`,
    { headers: { 'Content-Type': 'text/html' } },
  )
}
