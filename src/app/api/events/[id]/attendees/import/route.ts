import { NextRequest, NextResponse } from 'next/server'
import { importAttendeesCSV } from '@/lib/attendees/actions'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const text = await req.text()
    const result = await importAttendeesCSV(id, text)
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}
