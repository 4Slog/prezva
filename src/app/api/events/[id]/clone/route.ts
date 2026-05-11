import { NextRequest, NextResponse } from 'next/server'
import { cloneEvent } from '@/lib/productivity/sprint11-actions'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { title, slug } = await req.json()
  if (!title || !slug) return NextResponse.json({ error: 'title and slug required' }, { status: 400 })
  const result = await cloneEvent(id, title, slug)
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json(result)
}
