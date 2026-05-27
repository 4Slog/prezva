// One-off test email to verify Resend + domain delivery end-to-end.
// Generates a QR PNG, uploads it to the qr-codes Supabase Storage bucket,
// then sends a confirmation-style email pointing <img src> at the public URL.
// (Gmail strips data: URLs, so the email must use a real URL.)
// Run: node scripts/send-test-email.mjs
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import QRCode from 'qrcode'
import { createClient } from '@supabase/supabase-js'

function envValue(env, key) {
  const m = env.match(new RegExp(`^${key}=(.+)$`, 'm'))
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : null
}

const env = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
const resendKey   = envValue(env, 'RESEND_API_KEY')
const supabaseUrl = envValue(env, 'NEXT_PUBLIC_SUPABASE_URL')
const serviceKey  = envValue(env, 'SUPABASE_SERVICE_ROLE_KEY')
if (!resendKey || !supabaseUrl || !serviceKey) {
  console.error('Missing one of: RESEND_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const qrText = 'PREZVA-TEST1234'
const registrationId = `test-${Date.now()}`

const qrBuffer = await QRCode.toBuffer(qrText, { width: 200, margin: 1 })

const admin = createClient(supabaseUrl, serviceKey)
const fileName = `qr-${registrationId}.png`
const { error: upErr } = await admin.storage
  .from('qr-codes')
  .upload(fileName, qrBuffer, { contentType: 'image/png', upsert: true })
if (upErr) { console.error('QR upload failed:', upErr); process.exit(1) }
const { data: pub } = admin.storage.from('qr-codes').getPublicUrl(fileName)
const qrImgUrl = pub.publicUrl
console.log('Hosted QR URL:', qrImgUrl)

const BASE_URL = 'https://prezva.app'
const attendeeName = 'Paul Sowu'
const eventTitle = 'GAPP Annual Summit 2026'
const dateStr = 'Saturday, June 6, 2026 at 9:00 AM'
const eventVenue = 'Atlanta Convention Center, Atlanta, GA'
const orgName = 'Prezva Events'

const html = `
  <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
    <div style="background:#0D1B2A;padding:24px 32px;border-radius:12px 12px 0 0;">
      <div style="background:#00BFA6;width:32px;height:32px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;">
        <span style="color:#0D1B2A;font-weight:900;font-size:18px;">P</span>
      </div>
      <h1 style="color:#F0F4F8;font-size:22px;margin:0;">You're registered! (TEST)</h1>
    </div>
    <div style="background:#0F2236;padding:24px 32px;border-radius:0 0 12px 12px;color:#CBD5E1;">
      <p style="font-size:15px;">Hi ${attendeeName},</p>
      <p style="font-size:14px;color:#F59E0B;">⚠ This is a test email sent by Claude Code from Prezva to verify end-to-end Resend delivery and the hosted-QR rendering path used in production.</p>
      <p style="font-size:15px;">Your registration for <strong style="color:#F0F4F8;">${eventTitle}</strong> is confirmed.</p>
      <p style="margin:4px 0;">📅 ${dateStr}</p>
      <p style="margin:4px 0;">📍 ${eventVenue}</p>
      <div style="background:#0D1B2A;border:1px solid #1E3A5F;border-radius:8px;padding:16px 20px;margin:20px 0;text-align:center;">
        <p style="color:#94A3B8;font-size:12px;margin:0 0 10px;">Your check-in QR code</p>
        <img src="${qrImgUrl}" alt="QR Code" width="160" style="border-radius:4px;" />
        <p style="color:#64748B;font-size:11px;margin:8px 0 0;font-family:monospace;">${qrText}</p>
      </div>
      <hr style="border:none;border-top:1px solid #1E3A5F;margin:20px 0;" />
      <p style="color:#475569;font-size:12px;margin:0;">
        Sent by ${orgName} via <a href="${BASE_URL}" style="color:#00BFA6;text-decoration:none;">Prezva</a>. Test only.
      </p>
    </div>
  </div>
`

const text = [
  `Hi ${attendeeName},`,
  ``,
  `⚠ This is a TEST email sent by Claude Code to verify Resend delivery on prezva.app.`,
  ``,
  `Your registration for ${eventTitle} is confirmed.`,
  ``,
  `When: ${dateStr}`,
  `Where: ${eventVenue}`,
  ``,
  `Your check-in code: ${qrText}`,
  ``,
  `Sent by ${orgName} via Prezva.`,
].join('\n')

const res = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${resendKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    from: `${orgName} <noreply@prezva.app>`,
    to: 'sowu.paul@gmail.com',
    subject: `Test — Your registration for ${eventTitle}`,
    html,
    text,
    headers: { 'List-Unsubscribe': `<${BASE_URL}/api/unsubscribe?token=test&type=all>` },
  }),
})

const body = await res.text()
console.log('Resend status:', res.status)
console.log('Resend body:', body)
process.exit(res.ok ? 0 : 1)
