import { NextResponse } from 'next/server'

const C0_CONTROLS = /[\x00-\x1F\x7F]/g
const WHITESPACE_RUNS = /\s+/g
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_ALLOWED = /[^0-9 +\-()\s]/g

export interface SanitizedPaymentInput {
  ghlOrderId: string
  locationId: string
  contactId: string
  attendeeEmail: string
  attendeeName: string
  attendeePhone: string | null
  productId: string
  priceId: string
  amountPaidCents: number
}

type ParseOk = { ok: true; data: SanitizedPaymentInput }
type ParseErr = { ok: false; response: NextResponse }

export function parsePaymentWebhookInput(raw: {
  ghlOrderId: string | undefined
  locationId: string | undefined
  contactId: string | undefined
  attendeeEmail: string | undefined
  attendeeName: string | undefined
  attendeePhone: string | undefined
  productId: string | undefined
  priceId: string | undefined
  amountPaidCents: unknown
}): ParseOk | ParseErr {
  const err = (code: string, status = 400): ParseErr => ({
    ok: false,
    response: NextResponse.json({ error: code }, { status }),
  })

  // ID fields — trim only, no other mutation; defer presence check to caller
  const ghlOrderId  = raw.ghlOrderId?.trim() ?? ''
  const locationId  = raw.locationId?.trim() ?? ''
  const contactId   = raw.contactId?.trim() ?? ''
  const productId   = raw.productId?.trim() ?? ''
  const priceId     = raw.priceId?.trim() ?? ''

  // attendeeName
  const rawName = typeof raw.attendeeName === 'string' ? raw.attendeeName : ''
  const attendeeName = rawName
    .replace(C0_CONTROLS, '')
    .replace(WHITESPACE_RUNS, ' ')
    .trim()
    .slice(0, 200)
  if (!attendeeName) return err('invalid_name')

  // attendeeEmail
  const rawEmail = typeof raw.attendeeEmail === 'string' ? raw.attendeeEmail : ''
  const attendeeEmail = rawEmail
    .replace(C0_CONTROLS, '')
    .trim()
    .slice(0, 320)
  if (!attendeeEmail || !EMAIL_RE.test(attendeeEmail)) return err('invalid_email')

  // attendeePhone (optional)
  let attendeePhone: string | null = null
  if (raw.attendeePhone !== undefined && raw.attendeePhone !== null && raw.attendeePhone !== '') {
    const stripped = String(raw.attendeePhone)
      .replace(PHONE_ALLOWED, '')
      .slice(0, 50)
    attendeePhone = stripped || null
  }

  // amountPaidCents
  const amt = raw.amountPaidCents
  if (typeof amt !== 'number' || !Number.isFinite(amt) || amt < 0) {
    return err('invalid_amount')
  }
  const amountPaidCents = amt

  return {
    ok: true,
    data: { ghlOrderId, locationId, contactId, attendeeEmail, attendeeName, attendeePhone, productId, priceId, amountPaidCents },
  }
}
