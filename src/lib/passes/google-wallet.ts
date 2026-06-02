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

const PREZVA_LOGO_URL = 'https://prezva.app/icons/icon-512.png'

// Google Wallet logos must be a raster image (PNG/JPEG) served over HTTPS.
// SVGs (e.g. DiceBear placeholder avatars) and non-HTTPS URLs are rejected by
// Google and render as a blank circle, so we only use an org logo when it is a
// real raster image; otherwise we fall back to the Prezva mark.
function resolveLogoUrl(orgLogoUrl?: string | null): string {
  if (!orgLogoUrl) return PREZVA_LOGO_URL
  try {
    const u = new URL(orgLogoUrl)
    if (u.protocol !== 'https:') return PREZVA_LOGO_URL
    const path = u.pathname.toLowerCase()
    const isRaster = path.endsWith('.png') || path.endsWith('.jpg') || path.endsWith('.jpeg') || path.endsWith('.webp')
    // DiceBear and similar SVG-avatar services are not valid Wallet logos
    if (!isRaster) return PREZVA_LOGO_URL
    return orgLogoUrl
  } catch {
    return PREZVA_LOGO_URL
  }
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
    .select('*, events(title, start_at, timezone, venue_name, venue_city, venue_state, virtual_url, organizations(name, logo_url))')
    .eq('id', registrationId)
    .single()

  if (!reg) return { error: 'Registration not found' }

  const event = (reg as any).events
  const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID!
  const serviceEmail = process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL!
  const rawKey = process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_KEY!
  const privateKey = rawKey.replace(/\\n/g, '\n')

  const venuePhysical = [event.venue_name, event.venue_city, event.venue_state].filter(Boolean).join(', ')
  const isVirtual = !venuePhysical && !!event.virtual_url
  const location = venuePhysical || (isVirtual ? 'Virtual Event' : '')
  const orgName = event.organizations?.name as string | undefined
  const logoUrl = resolveLogoUrl(event.organizations?.logo_url)
  const classId = `${issuerId}.prezva-event-pass`
  const objectId = `${issuerId}.reg-${registrationId.replace(/-/g, '')}`

  const genericObject = {
    id: objectId,
    classId,
    state: 'ACTIVE',
    logo: {
      sourceUri: { uri: logoUrl },
      contentDescription: { defaultValue: { language: 'en-US', value: orgName ?? 'Prezva' } },
    },
    cardTitle: { defaultValue: { language: 'en-US', value: 'Event Pass' } },
    header: { defaultValue: { language: 'en-US', value: event.title } },
    ...(orgName ? { subheader: { defaultValue: { language: 'en-US', value: orgName } } } : {}),
    textModulesData: [
      { id: 'attendee', header: 'ATTENDEE', body: (reg as any).attendee_name },
      { id: 'date', header: 'DATE', body: formatDate(event.start_at, event.timezone) },
      ...(location ? [{ id: 'venue', header: 'LOCATION', body: location }] : []),
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
