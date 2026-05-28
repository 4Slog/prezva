import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params
  const upstream = `${process.env.SUPABASE_PROJECT_URL}/storage/v1/object/public/qr-codes/${filename}`
  const res = await fetch(upstream)
  if (!res.ok) return new NextResponse('Not found', { status: 404 })
  return new NextResponse(res.body, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
