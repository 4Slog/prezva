import { NextResponse } from 'next/server'

// Stub — Sprint 22 will implement PDF generation with @react-pdf/renderer
export async function GET() {
  return NextResponse.json(
    { error: 'Badge PDF printing is not yet implemented. This feature ships in Sprint 22.' },
    { status: 501 }
  )
}
