import { NextRequest, NextResponse } from 'next/server'
import { exportAttendeesCSV } from '@/lib/attendees/actions'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const csv = await exportAttendeesCSV(id)
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="attendees.csv"',
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}
