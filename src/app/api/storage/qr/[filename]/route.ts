import { NextRequest, NextResponse } from 'next/server'

// Restrict to the exact shape produced by registration.ts: `qr-<uuid>.png`.
// Rejects any traversal sequence, query/fragment chars, or path separators
// before we ever build the upstream URL.
const FILENAME_RE = /^[A-Za-z0-9_-]+\.png$/

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params
  if (!FILENAME_RE.test(filename)) {
    return new NextResponse('Bad Request', { status: 400 })
  }
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
