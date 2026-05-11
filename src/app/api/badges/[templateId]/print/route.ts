import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { BadgeField, BadgeTemplate } from '@/lib/checkin/sprint7-actions'

const PAPER_DIMS: Record<string, { w: string; h: string }> = {
  badge_4x3: { w: '4in', h: '3in' },
  badge_4x6: { w: '4in', h: '6in' },
  avery_5160: { w: '2.625in', h: '1in' },
  letter: { w: '8.5in', h: '11in' },
  a4: { w: '210mm', h: '297mm' },
}

function renderField(field: BadgeField, attendees: Array<Record<string, string>>, i: number): string {
  const a = attendees[i] ?? {}
  const rawValue: string = (() => {
    switch (field.type) {
      case 'name': return a.name ?? 'Attendee Name'
      case 'ticket': return a.ticket_name ?? 'Ticket'
      case 'company': return a.company ?? ''
      case 'email': return a.email ?? ''
      case 'custom_text': return field.value ?? ''
      case 'logo': return ''
      case 'qr_code': return `<img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(a.qr_code ?? a.email ?? '')}" style="width:100%;height:auto;" />`
      default: return ''
    }
  })()

  if (field.type === 'qr_code') {
    return `<div style="position:absolute;left:${field.x}%;top:${field.y}%;width:${field.width}%;">${rawValue}</div>`
  }
  if (field.type === 'logo') return ''

  return `<div style="position:absolute;left:${field.x}%;top:${field.y}%;width:${field.width}%;font-size:${field.font_size}px;font-weight:${field.font_weight};color:${field.color};text-align:${field.align};line-height:1.2;">${rawValue}</div>`
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ templateId: string }> },
) {
  const { templateId } = await params
  const supabase = await createClient()

  const { data: tmpl } = await supabase
    .from('badge_templates')
    .select('*')
    .eq('id', templateId)
    .single()

  if (!tmpl) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

  const template = tmpl as BadgeTemplate
  const dims = PAPER_DIMS[template.paper_size] ?? PAPER_DIMS.badge_4x3

  // Fetch all registrations for bulk print
  const eventId = req.nextUrl.searchParams.get('event') ?? template.event_id
  const { data: regs } = await supabase
    .from('registrations')
    .select('attendee_name, attendee_email, qr_code, ticket_types(name)')
    .eq('event_id', eventId)
    .neq('status', 'cancelled')
    .limit(500)

  const attendees = ((regs ?? []) as any[]).map(r => ({
    name: r.attendee_name ?? '',
    email: r.attendee_email ?? '',
    qr_code: r.qr_code ?? '',
    ticket_name: r.ticket_types?.name ?? '',
    company: '',
  }))

  const { background, font_family, fields } = template.template_json

  const badges = (attendees.length > 0 ? attendees : [{ name: 'Sample Name', email: 'sample@example.com', qr_code: 'SAMPLE', ticket_name: 'General Admission', company: '' }])
    .map((a, i) => `
      <div class="badge" style="width:${dims.w};height:${dims.h};background:${background};font-family:${font_family ?? 'Inter'},sans-serif;position:relative;overflow:hidden;page-break-after:always;box-sizing:border-box;">
        ${fields.map(f => renderField(f, attendees.length > 0 ? attendees : [{ name: 'Sample Name', email: 'sample@example.com', qr_code: 'SAMPLE', ticket_name: 'General Admission', company: '' }], i)).join('')}
      </div>
    `).join('')

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>${template.name}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #fff; }
    .badge { display: inline-block; vertical-align: top; }
    @media print {
      body { margin: 0; }
      .no-print { display: none; }
      .badge { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="padding:16px;background:#f8fafc;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;gap:12px;">
    <strong style="font-family:sans-serif;font-size:14px;">${template.name}</strong>
    <span style="font-family:sans-serif;font-size:12px;color:#64748b;">${attendees.length} badge${attendees.length !== 1 ? 's' : ''}</span>
    <button onclick="window.print()" style="margin-left:auto;background:#00BFA6;color:#0D1B2A;border:none;padding:8px 16px;border-radius:8px;font-weight:600;cursor:pointer;font-size:13px;">Print All</button>
  </div>
  ${badges}
</body>
</html>`

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
