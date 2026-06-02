'use server'

import { createSign } from 'crypto'
import { createServiceClient } from '@/lib/supabase/service'

function isConfigured() {
  return !!(
    process.env.GOOGLE_WALLET_ISSUER_ID &&
    process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_KEY
  )
}

function formatDate(iso: string, tz?: string) {
  return new Date(iso).toLocaleDateString('en-US', { timeZone: tz ?? 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
}

function signJwt(payload: Record<string, unknown>, serviceAccountEmail: string, privateKey: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signingInput = `${header}.${body}`

  const sign = createSign('RSA-SHA256')
  sign.update(signingInput)
  const sig = sign.sign(privateKey, 'base64url')
  return `${signingInput}.${sig}`
}

export async function generateGoogleWalletUrl(registrationId: string): Promise<{ url: string; error?: never } | { error: string; url?: never }> {
  if (!isConfigured()) {
    return { error: 'Google Wallet not configured' }
  }

  const supabase = createServiceClient()
  const { data: reg } = await supabase
    .from('registrations')
    .select('*, events(title, start_at, timezone, venue_name, venue_city, venue_state, organizations(name))')
    .eq('id', registrationId)
    .single()

  if (!reg) return { error: 'Registration not found' }

  const event = (reg as any).events
  const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID!
  const serviceEmail = process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL!
  const rawKey = process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_KEY!
  const privateKey = rawKey.replace(/\\n/g, '\n')

  const venue = [event.venue_name, event.venue_city, event.venue_state].filter(Boolean).join(', ')
  const classId = `${issuerId}.prezva-event-pass`
  const objectId = `${issuerId}.reg-${registrationId.replace(/-/g, '')}`

  const genericObject = {
    id: objectId,
    classId,
    state: 'ACTIVE',
    cardTitle: { defaultValue: { language: 'en-US', value: 'Event Pass' } },
    header: { defaultValue: { language: 'en-US', value: event.title } },
    textModulesData: [
      { id: 'attendee', header: 'ATTENDEE', body: (reg as any).attendee_name },
      { id: 'date', header: 'DATE', body: formatDate(event.start_at, event.timezone) },
      ...(venue ? [{ id: 'venue', header: 'VENUE', body: venue }] : []),
    ],
    barcode: {
      type: 'QR_CODE',
      value: (reg as any).qr_code ?? registrationId,
      alternateText: (reg as any).attendee_name,
    },
    hexBackgroundColor: '#0D1B2A',
  }

  const payload = {
    iss: serviceEmail,
    aud: 'google',
    typ: 'savetowallet',
    iat: Math.floor(Date.now() / 1000),
    payload: { genericObjects: [genericObject] },
  }

  try {
    const jwt = signJwt(payload, serviceEmail, privateKey)
    return { url: `https://pay.google.com/gp/v/save/${jwt}` }
  } catch (err: any) {
    return { error: err.message ?? 'Failed to generate Google Wallet URL' }
  }
}
