import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { validateSpeakerToken } from '@/lib/speaker/speaker-actions'

const ALLOWED_TYPES = [
  'application/pdf',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]
const MAX_SIZE = 20 * 1024 * 1024

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const sessionId = formData.get('sessionId') as string
  const speakerId = formData.get('speakerId') as string
  const eventId = formData.get('eventId') as string
  const token = formData.get('token') as string

  if (!file || !sessionId || !speakerId || !eventId || !token) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const tokenData = await validateSpeakerToken(token)
  if (!tokenData || tokenData.speaker_id !== speakerId || tokenData.event_id !== eventId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Only PDF and PowerPoint files allowed' }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File too large (max 20MB)' }, { status: 400 })
  }

  const admin = createAdminClient()
  const ext = file.name.split('.').pop() ?? 'bin'
  const path = `${eventId}/${speakerId}/${sessionId}/${Date.now()}.${ext}`
  const bytes = await file.arrayBuffer()

  const { error: uploadError } = await admin.storage
    .from('speaker-handouts')
    .upload(path, bytes, { contentType: file.type, upsert: false })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  // Find current latest handout for versioning
  const { data: currentLatest } = await admin
    .from('session_handouts')
    .select('id, version')
    .eq('session_id', sessionId)
    .eq('speaker_id', speakerId)
    .eq('is_latest', true)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextVersion = currentLatest ? (currentLatest as any).version + 1 : 1
  const newId = crypto.randomUUID()

  const { error: dbError } = await admin.from('session_handouts').insert({
    id: newId,
    session_id: sessionId,
    speaker_id: speakerId,
    filename: file.name,
    storage_path: path,
    version: nextVersion,
    is_latest: true,
  })

  if (dbError) {
    await admin.storage.from('speaker-handouts').remove([path])
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  // Mark previous latest as superseded
  if (currentLatest) {
    await admin
      .from('session_handouts')
      .update({ is_latest: false, superseded_by: newId })
      .eq('id', (currentLatest as any).id)
  }

  // Notify attendees about new handout (fire-and-forget, non-blocking)
  void notifyAttendeesOfHandout(admin, sessionId, eventId, file.name).catch(() => {})

  return NextResponse.json({ ok: true })
}

async function notifyAttendeesOfHandout(
  admin: ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>,
  sessionId: string,
  eventId: string,
  filename: string,
) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://prezva.app'
  const today = new Date().toISOString().slice(0, 10)

  // Rate-limit: skip if 3+ handout notifications already sent for this session today
  const { count } = await admin.from('session_handouts')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .gte('created_at', `${today}T00:00:00Z`)
  if ((count ?? 0) > 3) return

  const { data: session } = await admin
    .from('sessions')
    .select('title, events(slug, title, organizations(name))')
    .eq('id', sessionId)
    .maybeSingle()
  if (!session) return

  const eventSlug = (session as any).events?.slug ?? ''
  const eventTitle = (session as any).events?.title ?? 'the event'
  const sessionTitle = (session as any).title ?? 'a session'
  const orgName = (session as any).events?.organizations?.name ?? 'Your organizer'
  const agendaUrl = `${appUrl}/e/${eventSlug}/agenda`

  const { data: regs } = await admin
    .from('registrations')
    .select('attendee_email, attendee_name')
    .eq('event_id', eventId)
    .in('status', ['confirmed', 'checked_in'])
    .limit(500)

  if (!regs || regs.length === 0) return

  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return

  for (const reg of regs) {
    const firstName = (reg as any).attendee_name?.trim().split(/\s+/)[0] ?? 'there'
    const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#0D1B2A;padding:24px 32px;border-radius:12px 12px 0 0;">
        <h1 style="color:#F0F4F8;font-size:18px;margin:0;">New materials available: ${sessionTitle}</h1>
      </div>
      <div style="background:#0F2236;padding:24px 32px;border-radius:0 0 12px 12px;color:#CBD5E1;">
        <p style="font-size:15px;">Hi ${firstName},</p>
        <p style="font-size:15px;">${orgName} has uploaded new materials for <strong style="color:#F0F4F8;">${sessionTitle}</strong> at ${eventTitle}.</p>
        <p style="margin:16px 0;"><a href="${agendaUrl}" style="color:#00BFA6;text-decoration:none;">Download at the agenda page →</a></p>
        <p style="color:#475569;font-size:12px;">Powered by <a href="https://prezva.app" style="color:#00BFA6;text-decoration:none;">Prezva</a></p>
      </div>
    </div>`

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${orgName} <noreply@prezva.app>`,
        to: (reg as any).attendee_email,
        subject: `New materials: ${sessionTitle} — ${eventTitle}`,
        html,
      }),
    })
  }
}
