import { NextRequest, NextResponse } from 'next/server'
import Papa from 'papaparse'
import { detectCsvColumns } from '@/lib/productivity/csv-utils'
import { previewAgendaCsv, importAgendaFromCsv } from '@/lib/productivity/sprint11-actions'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const { csv, columnMap, preview } = body as { csv: string; columnMap?: Record<string, string>; preview?: boolean }

  if (!csv) return NextResponse.json({ error: 'csv required' }, { status: 400 })

  const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true })
  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    return NextResponse.json({ error: 'Failed to parse CSV' }, { status: 400 })
  }

  const headers = parsed.meta.fields ?? []

  if (!columnMap) {
    // Auto-detect phase — return headers + detected mappings
    const detected = detectCsvColumns(headers)
    return NextResponse.json({ headers, detected, rowCount: parsed.data.length })
  }

  if (preview) {
    const rows = await previewAgendaCsv(id, parsed.data, columnMap)
    return NextResponse.json({ rows })
  }

  const result = await importAgendaFromCsv(id, parsed.data, columnMap)
  return NextResponse.json(result)
}
