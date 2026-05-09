import { NextRequest, NextResponse } from 'next/server'
import { createSession, getSessions } from '@/lib/agenda/actions'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    return NextResponse.json(await getSessions(id))
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 400 }) }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const result = await createSession(id, await req.json())
    return NextResponse.json(result)
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 400 }) }
}
