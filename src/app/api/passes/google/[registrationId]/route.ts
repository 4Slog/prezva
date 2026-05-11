import { NextRequest, NextResponse } from 'next/server'
import { generateGoogleWalletUrl } from '@/lib/passes/google-wallet'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ registrationId: string }> }) {
  const { registrationId } = await params
  const result = await generateGoogleWalletUrl(registrationId)

  if (result.error) {
    const status = result.error === 'Google Wallet not configured' ? 501 : 400
    return NextResponse.json({ error: result.error }, { status })
  }

  return NextResponse.redirect(result.url!)
}
