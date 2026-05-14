import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { BADGE_TEMPLATES } from '@/lib/templates/badges'
import type { BadgeTemplate, BadgeField } from '@/lib/templates/types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface RegRow {
  id: string
  attendee_name: string
  attendee_email: string
  attendee_company: string | null
  attendee_job_title: string | null
  qr_code: string
  ticket_types: { name: string } | null
}

interface BindingMap {
  [key: string]: string
}

function buildBindings(reg: RegRow, eventTitle: string): BindingMap {
  return {
    attendee_name: reg.attendee_name,
    attendee_email: reg.attendee_email,
    attendee_company: reg.attendee_company ?? '',
    attendee_title: reg.attendee_job_title ?? '',
    ticket_type_name: reg.ticket_types?.name ?? '',
    event_title: eventTitle,
    qr_code: reg.qr_code,
  }
}

function resolve(value: string, bindings: BindingMap): string {
  return Object.entries(bindings).reduce(
    (s, [k, v]) => s.replaceAll(`{${k}}`, v),
    value,
  )
}

async function buildQrDataUrl(value: string): Promise<string> {
  return QRCode.toDataURL(value, { width: 120, margin: 1, color: { dark: '#000000', light: '#ffffff' } })
}

function fieldToHtml(field: BadgeField, bindings: BindingMap, qrDataUrl: string): string {
  const mm = (n: number) => `${n}mm`
  const base = `position:absolute;left:${mm(field.x)};top:${mm(field.y)};width:${mm(field.w)};height:${mm(field.h)};overflow:hidden;`

  if (field.type === 'qr') {
    const transform = field.invert ? 'filter:invert(1);' : ''
    return `<img src="${qrDataUrl}" style="${base}${transform}object-fit:contain;width:${mm(field.w)};height:${mm(field.h)};" />`
  }

  if (field.type === 'image') {
    const src = field.binding ? (bindings[field.binding] ?? '') : ''
    if (!src) return ''
    const radius = field.shape === 'circle' ? 'border-radius:50%;' : ''
    return `<img src="${src}" style="${base}${radius}object-fit:contain;width:${mm(field.w)};height:${mm(field.h)};" />`
  }

  // text field
  const text = field.static ?? (field.binding ? resolve(`{${field.binding}}`, bindings) : '')
  const fs = field.font_size ? `font-size:${field.font_size}pt;` : ''
  const fw = field.weight === 'bold' ? 'font-weight:700;' : 'font-weight:400;'
  const ta = field.align ? `text-align:${field.align};` : 'text-align:left;'
  const color = field.color ? `color:${field.color};` : 'color:#111;'
  const ww = field.wrap ? 'white-space:normal;' : 'white-space:nowrap;'
  const rot = field.rotation ? `transform:rotate(${field.rotation}deg);transform-origin:top left;` : ''
  return `<div style="${base}${fs}${fw}${ta}${color}${ww}${rot}display:flex;align-items:center;">${text}</div>`
}

function badgeToHtml(template: BadgeTemplate, bindings: BindingMap, qrDataUrl: string): string {
  const { width_mm, height_mm } = template.size
  const accentColor = template.accent_color ?? '#00BFA6'
  const fields = template.fields
    .map((f) => fieldToHtml(f, bindings, qrDataUrl))
    .filter(Boolean)
    .join('\n')

  return `<div class="badge" style="position:relative;width:${width_mm}mm;height:${height_mm}mm;background:#fff;border:2px solid ${accentColor};box-sizing:border-box;font-family:Inter,Helvetica,sans-serif;overflow:hidden;page-break-after:always;">
${fields}
</div>`
}

// ZPL helpers — 8 dots per mm at 203dpi
const D = 8

function fieldToZpl(field: BadgeField, bindings: BindingMap): string {
  const x = Math.round(field.x * D)
  const y = Math.round(field.y * D)
  const w = Math.round(field.w * D)

  if (field.type === 'qr') {
    const val = field.binding ? (bindings[field.binding] ?? '') : ''
    const mag = Math.max(1, Math.min(10, Math.round(field.w * D / 30)))
    return `^FO${x},${y}^BQN,2,${mag}^FDQA,${val}^FS`
  }

  if (field.type !== 'text') return ''

  const text = field.static ?? (field.binding ? resolve(`{${field.binding}}`, bindings) : '')
  if (!text) return ''
  const fs = field.font_size ?? 12
  const zFont = fs >= 20 ? 'B' : 'A'
  const zH = Math.round(fs * 1.5)
  const zW = Math.round(fs * 1.2)
  const align = field.align === 'center' ? `^FB${w},1,,C,` : `^FB${w},1,,L,`
  return `^FO${x},${y}^A${zFont}N,${zH},${zW}${align}^FD${text}^FS`
}

function badgeToZpl(template: BadgeTemplate, bindings: BindingMap): string {
  const { width_mm, height_mm } = template.size
  const pw = Math.round(width_mm * D)
  const ph = Math.round(height_mm * D)
  const fields = template.fields.map((f) => fieldToZpl(f, bindings)).filter(Boolean).join('\n')
  return `^XA\n^PW${pw}\n^LL${ph}\n${fields}\n^XZ`
}

type Params = { params: Promise<{ eventId: string }> }

export async function GET(
  req: NextRequest,
  { params }: Params,
) {
  const { eventId } = await params
  const { searchParams } = req.nextUrl
  const templateId = searchParams.get('templateId')
  const registrationId = searchParams.get('registrationId')
  const format = searchParams.get('format') ?? 'html'

  if (!templateId) {
    return NextResponse.json({ error: 'templateId is required' }, { status: 400 })
  }

  const supabase = await createClient()
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Auth: must be org member
  const { data: event } = await supabase
    .from('events')
    .select('id, title, org_id')
    .eq('id', eventId)
    .single()
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  const { data: member } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', (event as any).org_id)
    .eq('user_id', user.id)
    .single()
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Resolve template
  let template: BadgeTemplate | null = null

  if (UUID_RE.test(templateId)) {
    const { data: tpl } = await supabase
      .from('badge_templates')
      .select('id, name, template_json')
      .eq('id', templateId)
      .single()
    if (tpl) {
      const tj = (tpl as any).template_json as BadgeTemplate
      template = { ...tj, id: (tpl as any).id, name: (tpl as any).name }
    }
  } else {
    template = BADGE_TEMPLATES.find((t) => t.id === templateId) ?? null
  }

  if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

  // Fetch registrations
  let query = supabase
    .from('registrations')
    .select('id, attendee_name, attendee_email, attendee_company, attendee_job_title, qr_code, ticket_types(name)')
    .eq('event_id', eventId)
    .eq('status', 'confirmed')

  if (registrationId) query = query.eq('id', registrationId)

  const { data: regs } = await query
  if (!regs || regs.length === 0) {
    return NextResponse.json({ error: 'No confirmed registrations found' }, { status: 404 })
  }

  const eventTitle = (event as any).title as string

  if (format === 'zpl') {
    const zplPages = (regs as unknown as RegRow[]).map((reg) => {
      const bindings = buildBindings(reg, eventTitle)
      return badgeToZpl(template!, bindings)
    })
    return new NextResponse(zplPages.join('\n'), {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="badges-${eventId}.zpl"`,
      },
    })
  }

  // HTML render — generate QR data URLs for each reg
  const badges: string[] = []
  for (const reg of regs as unknown as RegRow[]) {
    const bindings = buildBindings(reg, eventTitle)
    const qrUrl = await buildQrDataUrl(reg.qr_code)
    badges.push(badgeToHtml(template!, bindings, qrUrl))
  }

  const { width_mm, height_mm } = template.size
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Badges — ${eventTitle}</title>
<style>
  @page { size: ${width_mm}mm ${height_mm}mm; margin: 0; }
  body { margin: 0; padding: 0; background: #f0f0f0; }
  .badge { display: inline-block; margin: 4mm; }
  @media print {
    body { background: white; }
    .badge { margin: 0; }
  }
</style>
</head>
<body>
${badges.join('\n')}
</body>
</html>`

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  })
}
