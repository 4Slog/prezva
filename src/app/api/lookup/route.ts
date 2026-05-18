import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { headers } from 'next/headers'

const lookupLimiter = (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
  ? new Ratelimit({
      redis: new Redis({ url: process.env.UPSTASH_REDIS_REST_URL!, token: process.env.UPSTASH_REDIS_REST_TOKEN! }),
      limiter: Ratelimit.slidingWindow(3, '1 h'),
      prefix: 'rl:lookup',
    })
  : null

const OK = NextResponse.json({ ok: true })

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const email = (body.email as string | undefined)?.trim().toLowerCase()
  if (!email || !email.includes('@')) return OK

  // Rate limit per email address (prevents abuse; same response regardless)
  if (lookupLimiter) {
    const { success } = await lookupLimiter.limit(`lookup:${email}`)
    if (!success) return OK // silently accept — don't reveal that rate limit was hit
  }

  const admin = createAdminClient()
  const { data: regs } = await admin
    .from('registrations')
    .select('id, events(title, slug)')
    .eq('attendee_email', email)
    .in('status', ['confirmed', 'checked_in'])
    .limit(10)

  if (!regs || regs.length === 0) return OK // no disclosure

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://prezva.app'

  const items = regs.map((r: any) => {
    const slug = r.events?.slug ?? ''
    const title = r.events?.title ?? 'an event'
    const url = `${appUrl}/e/${slug}/confirmation?reg=${r.id}`
    return `<li style="margin-bottom:8px;"><strong style="color:#F0F4F8;">${title}</strong><br/><a href="${url}" style="color:#00BFA6;font-size:13px;">${url}</a></li>`
  }).join('')

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#0D1B2A;padding:24px 32px;border-radius:12px 12px 0 0;">
        <span style="background:#00BFA6;color:#0D1B2A;font-weight:900;font-size:18px;padding:4px 10px;border-radius:6px;">P</span>
        <h1 style="color:#F0F4F8;font-size:20px;margin:12px 0 0;">Your registration links</h1>
      </div>
      <div style="background:#0F2236;padding:24px 32px;border-radius:0 0 12px 12px;color:#CBD5E1;">
        <p>We found the following registrations for <strong>${email}</strong>:</p>
        <ul style="padding-left:0;list-style:none;">${items}</ul>
        <hr style="border:none;border-top:1px solid #1E3A5F;margin:20px 0;"/>
        <p style="color:#475569;font-size:12px;">Sent by <a href="${appUrl}" style="color:#00BFA6;">Prezva</a>. If you did not request this, ignore this email.</p>
      </div>
    </div>
  `

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Prezva <noreply@prezva.app>',
      to: email,
      subject: 'Your Prezva registration links',
      html,
    }),
  })

  return OK
}
