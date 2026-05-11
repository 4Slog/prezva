import { NextRequest, NextResponse } from 'next/server'
import { generateAppleWalletPass } from '@/lib/passes/apple-pass'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ registrationId: string }> }) {
  const { registrationId } = await params
  const result = await generateAppleWalletPass(registrationId)

  if (result.error) {
    const status = result.error === 'Apple Wallet not configured' ? 501 : 400
    return NextResponse.json({ error: result.error }, { status })
  }

  return new NextResponse(result.buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.apple.pkpass',
      'Content-Disposition': `attachment; filename="event-pass.pkpass"`,
    },
  })
}
