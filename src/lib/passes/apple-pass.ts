'use server'

import { PKPass } from 'passkit-generator'
import { createClient } from '@/lib/supabase/server'

function isCertConfigured() {
  return !!(
    process.env.APPLE_PASS_TEAM_ID &&
    process.env.APPLE_PASS_TYPE_IDENTIFIER &&
    process.env.APPLE_PASS_CERT &&
    process.env.APPLE_PASS_KEY &&
    process.env.APPLE_PASS_WWDR
  )
}

function formatDate(iso: string, tz?: string) {
  return new Date(iso).toLocaleDateString('en-US', { timeZone: tz ?? 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
}

export async function generateAppleWalletPass(registrationId: string): Promise<{ buffer: Buffer; error?: never } | { error: string; buffer?: never }> {
  if (!isCertConfigured()) {
    return { error: 'Apple Wallet not configured' }
  }

  const supabase = await createClient()
  const { data: reg } = await supabase
    .from('registrations')
    .select('*, events(title, start_at, end_at, timezone, venue_name, venue_city, venue_state)')
    .eq('id', registrationId)
    .single()

  if (!reg) return { error: 'Registration not found' }

  const event = (reg as any).events
  const teamId = process.env.APPLE_PASS_TEAM_ID!
  const passTypeId = process.env.APPLE_PASS_TYPE_IDENTIFIER!
  const signerCert = Buffer.from(process.env.APPLE_PASS_CERT!, 'base64')
  const signerKey = Buffer.from(process.env.APPLE_PASS_KEY!, 'base64')
  const wwdr = Buffer.from(process.env.APPLE_PASS_WWDR!, 'base64')

  const venue = [event.venue_name, event.venue_city, event.venue_state].filter(Boolean).join(', ')

  const passJson = {
    formatVersion: 1,
    passTypeIdentifier: passTypeId,
    serialNumber: registrationId,
    teamIdentifier: teamId,
    organizationName: 'Prezva',
    description: event.title,
    backgroundColor: 'rgb(13, 27, 42)',
    foregroundColor: 'rgb(240, 244, 248)',
    labelColor: 'rgb(0, 191, 166)',
    eventTicket: {
      primaryFields: [
        { key: 'event', label: 'EVENT', value: event.title },
      ],
      secondaryFields: [
        { key: 'date', label: 'DATE', value: formatDate(event.start_at, event.timezone) },
        { key: 'attendee', label: 'ATTENDEE', value: (reg as any).attendee_name },
      ],
      auxiliaryFields: venue ? [
        { key: 'venue', label: 'VENUE', value: venue },
      ] : [],
    },
    barcodes: [{
      message: (reg as any).qr_code ?? registrationId,
      format: 'PKBarcodeFormatQR',
      messageEncoding: 'iso-8859-1',
    }],
    relevantDate: event.start_at,
  }

  const iconPng = Buffer.alloc(68, 0)
  iconPng.write('\x89PNG\r\n\x1a\n', 0, 'binary')

  try {
    const pass = new PKPass(
      { 'pass.json': Buffer.from(JSON.stringify(passJson)), 'icon.png': iconPng },
      { signerCert, signerKey, wwdr },
    )
    const buffer = await pass.getAsBuffer()
    return { buffer: buffer as Buffer }
  } catch (err: any) {
    return { error: err.message ?? 'Failed to generate pass' }
  }
}
