import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    push_configured: !!(
      process.env.VAPID_PRIVATE_KEY &&
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
      process.env.VAPID_EMAIL
    ),
    vapid_email: process.env.VAPID_EMAIL ?? null,
    vapid_private_key_present: !!process.env.VAPID_PRIVATE_KEY,
    vapid_public_key_present: !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  })
}
