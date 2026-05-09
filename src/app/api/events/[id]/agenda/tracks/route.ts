import { NextRequest, NextResponse } from 'next/server'
import { createTrack, getTracks } from '@/lib/agenda/actions'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    return NextResponse.json(await getTracks(id))
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 400 }) }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const result = await createTrack(id, await req.json())
    return NextResponse.json(result)
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 400 }) }
}
