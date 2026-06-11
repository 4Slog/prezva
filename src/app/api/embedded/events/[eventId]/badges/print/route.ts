import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyEmbeddedSession, COOKIE_NAME } from '@/lib/embedded/session'
import { BADGE_TEMPLATES } from '@/lib/templates/badges'
import type { BadgeTemplate, BadgeField } from '@/lib/templates/types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ── Auth: embedded session → org ──────────────────────────────────────────────

async function resolveEmbedOrg() {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return null
  try {
    const session = await verifyEmbeddedSession(token)
    const db = createAdminClient()
    const { data: link } = await db
      .from('ghl_location_links')
      .select('org_id')
      .eq('ghl_location_id', session.location_id)
      .maybeSingle()
    return link?.org_id ?? null
  } catch {
    return null
  }
}

// ── Render helpers (mirrored from /api/events/[id]/badges/print) ─────────────

interface RegRow {
  id: string
  attendee_name: string
  attendee_email: string
  attendee_company: string | null
  attendee_job_title: string | null
  qr_code: string
  ticket_type_id: string | null
  ticket_types: { name: string; is_press: boolean } | null
}

interface BindingMap {
  [key: string]: string
}

const EVENT_ROLE_LABELS: Record<string, string> = {
  mc: 'EMCEE',
  chair: 'PROGRAM CHAIR',
  host: 'HOST',
  guest: 'GUEST',
  vip: 'VIP',
}

function buildBindings(reg: RegRow, eventTitle: string, speakerEventRole?: string | null): BindingMap {
  const roleLabel = speakerEventRole && speakerEventRole !== 'speaker'
    ? (EVENT_ROLE_LABELS[speakerEventRole] ?? speakerEventRole.toUpperCase())
    : ''
  return {
    attendee_name: reg.attendee_name,
    attendee_email: reg.attendee_email,
    attendee_company: reg.attendee_company ?? '',
    attendee_title: reg.attendee_job_title ?? '',
    ticket_type_name: reg.ticket_types?.name ?? '',
    event_title: eventTitle,
    qr_code: reg.qr_code,
    speaker_event_role_label: roleLabel,
    speaker_photo_url: '',
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

// ── Route handler ─────────────────────────────────────────────────────────────

type Params = { params: Promise<{ eventId: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { eventId } = await params
  const { searchParams } = req.nextUrl
  const templateId = searchParams.get('templateId')
  const registrationId = searchParams.get('registrationId')
  const format = searchParams.get('format') ?? 'html'
  const preview = searchParams.get('preview') === '1'

  if (!templateId) {
    return NextResponse.json({ error: 'templateId is required' }, { status: 400 })
  }

  // Auth: resolve embed session → org_id
  const orgId = await resolveEmbedOrg()
  if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // Verify event belongs to this embed's org
  const { data: event } = await admin
    .from('events')
    .select('id, title, org_id, badge_rules')
    .eq('id', eventId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 403 })

  // Resolve template — verify custom templates belong to this org
  let template: BadgeTemplate | null = null

  if (UUID_RE.test(templateId)) {
    const { data: tpl } = await admin
      .from('badge_templates')
      .select('id, name, template_json, org_id')
      .eq('id', templateId)
      .eq('org_id', orgId)
      .maybeSingle()
    if (tpl) {
      const tj = (tpl as any).template_json as BadgeTemplate
      template = { ...tj, id: (tpl as any).id, name: (tpl as any).name }
    }
  } else {
    template = BADGE_TEMPLATES.find((t) => t.id === templateId) ?? null
  }

  if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

  // Fetch registrations (admin client; event ownership already verified above)
  let query = admin
    .from('registrations')
    .select('id, attendee_name, attendee_email, attendee_company, attendee_job_title, qr_code, ticket_type_id, ticket_types(name, is_press)')
    .eq('event_id', eventId)
    .eq('status', 'confirmed')

  if (registrationId) query = query.eq('id', registrationId)
  if (preview) query = query.limit(1)

  let { data: regs, error: regsError } = await query
  if (regsError && regsError.code === '42703') {
    let retry = admin
      .from('registrations')
      .select('id, attendee_name, attendee_email, attendee_company, attendee_job_title, qr_code, ticket_type_id, ticket_types(name)')
      .eq('event_id', eventId)
      .eq('status', 'confirmed')
    if (registrationId) retry = retry.eq('id', registrationId)
    if (preview) retry = retry.limit(1)
    const r = await retry
    regs = r.data as any
    regsError = r.error
  }
  if (regsError) {
    return NextResponse.json({ error: regsError.message }, { status: 500 })
  }
  if (!regs || regs.length === 0) {
    return NextResponse.json({ error: 'No confirmed registrations found' }, { status: 404 })
  }

  const { data: confirmedSpeakers } = await admin
    .from('speakers')
    .select('email, event_role, photo_url')
    .eq('event_id', eventId)
    .eq('status', 'confirmed')

  const speakerByEmail = new Map<string, { event_role: string; photo_url: string | null }>()
  for (const sp of confirmedSpeakers ?? []) {
    if (sp.email) speakerByEmail.set(sp.email.toLowerCase(), { event_role: sp.event_role ?? 'speaker', photo_url: sp.photo_url })
  }

  const speakerTemplate = BADGE_TEMPLATES.find(t => t.id === 'speaker') ?? null
  const eventTitle = (event as any).title as string
  const badgeRules: any[] = (event as any).badge_rules ?? []

  async function resolveTemplateById(tid: string): Promise<BadgeTemplate | null> {
    if (UUID_RE.test(tid)) {
      const { data: tpl } = await admin
        .from('badge_templates')
        .select('id, name, template_json, org_id')
        .eq('id', tid)
        .eq('org_id', orgId!)
        .maybeSingle()
      if (tpl) {
        const tj = (tpl as any).template_json as BadgeTemplate
        return { ...tj, id: (tpl as any).id, name: (tpl as any).name }
      }
      return null
    }
    return BADGE_TEMPLATES.find(t => t.id === tid) ?? null
  }

  async function resolveTemplate(
    reg: RegRow & { speakerMatch: boolean; ticket_type_id?: string | null; is_press_ticket?: boolean },
  ): Promise<BadgeTemplate> {
    for (const rule of badgeRules) {
      if (rule.condition === 'is_speaker' && reg.speakerMatch) {
        const t = await resolveTemplateById(rule.templateId)
        if (t) return t
      }
      if (rule.condition === 'is_press' && reg.is_press_ticket) {
        const t = await resolveTemplateById(rule.templateId)
        if (t) return t
      }
      if (rule.condition === 'ticket_type' && reg.ticket_type_id === rule.ticketTypeId) {
        const t = await resolveTemplateById(rule.templateId)
        if (t) return t
      }
      if (rule.condition === 'default') {
        const t = await resolveTemplateById(rule.templateId)
        if (t) return t
      }
    }
    if (reg.speakerMatch && speakerTemplate) return speakerTemplate
    return template!
  }

  if (format === 'zpl') {
    const zplPages: string[] = []
    for (const reg of regs as unknown as RegRow[]) {
      const speakerInfo = speakerByEmail.get(reg.attendee_email.toLowerCase())
      const enriched = { ...reg, speakerMatch: !!speakerInfo, is_press_ticket: !!(reg.ticket_types as any)?.is_press }
      const effectiveTemplate = await resolveTemplate(enriched)
      const bindings = buildBindings(reg, eventTitle, speakerInfo?.event_role)
      zplPages.push(badgeToZpl(effectiveTemplate, bindings))
    }
    return new NextResponse(zplPages.join('\n'), {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="badges-${eventId}.zpl"`,
      },
    })
  }

  const badges: string[] = []
  for (const reg of regs as unknown as RegRow[]) {
    const speakerInfo = speakerByEmail.get(reg.attendee_email.toLowerCase())
    const enriched = { ...reg, speakerMatch: !!speakerInfo, is_press_ticket: !!(reg.ticket_types as any)?.is_press }
    const effectiveTemplate = await resolveTemplate(enriched)
    const bindings = buildBindings(reg, eventTitle, speakerInfo?.event_role)
    if (speakerInfo?.photo_url) bindings['speaker_photo_url'] = speakerInfo.photo_url
    const qrUrl = await buildQrDataUrl(reg.qr_code)
    badges.push(badgeToHtml(effectiveTemplate, bindings, qrUrl))
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
