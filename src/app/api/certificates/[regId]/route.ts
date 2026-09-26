import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createElement, type ReactElement } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { issueOrGetCertificate } from '@/lib/certificates/certificate-data'
import { CERTIFICATE_NOT_AVAILABLE, isCertificateServable } from '@/lib/certificates/servable'
import { Certificate } from '@/lib/pdf/Certificate'
import { DEFAULT_CERTIFICATE_TEMPLATE } from '@/lib/templates/certificates'
import type { CertificateTemplatePayload } from '@/lib/templates/certificates'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ regId: string }> }
) {
  const { regId } = await params
  const token = request.nextUrl.searchParams.get('token')

  // Admin client: certificate download accessible by owner or token bearer (unguessable UUID + secret token)
  const admin = createAdminClient()

  const { data: reg, error: regErr } = await admin
    .from('registrations')
    .select('id, user_id, status, certificate_token, attendee_name, attendee_email, events(id, title, start_at, organizations(id, name, logo_url))')
    .eq('id', regId)
    .maybeSingle()

  if (regErr) {
    console.error('[certificate] registration lookup failed', { regId, error: regErr.message })
    return NextResponse.json({ error: 'Your certificate could not be prepared. Please try again later.' }, { status: 500 })
  }
  if (!reg) return new NextResponse('Not found', { status: 404 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const ownerMatch = user?.id === reg.user_id
  const tokenMatch = token && token === reg.certificate_token
  if (!ownerMatch && !tokenMatch) return new NextResponse('Forbidden', { status: 403 })

  // O157: a cancelled or refunded registration's certificate is not served
  // (the stored row is kept). Checked before issueOrGetCertificate so nothing
  // is issued or repaired for it either.
  if (!isCertificateServable(reg.status)) {
    return NextResponse.json({ error: CERTIFICATE_NOT_AVAILABLE }, { status: 410 })
  }

  // F-R3: an issued certificate is final. issueOrGetCertificate returns the
  // stored row WITHOUT re-running eligibility when one exists, and only gates
  // on eligibility when nothing has been issued yet. The PDF below renders
  // from that stored row, so later rule changes or sessions added after
  // issuance never revoke or alter a certificate someone already holds.
  const result = await issueOrGetCertificate(regId)
  if (result.skipped) {
    return NextResponse.json({ error: result.error ?? 'Certificate not yet earned' }, { status: 412 })
  }
  const issued = result.data as {
    verification_id: string
    created_at: string
    template_id: string | null
    ce_credit_hours: number | string
    sessions_attended: number
  } | undefined
  if (result.error || !issued) {
    // issue-core errors can carry raw database messages; log them, return a generic one.
    console.error('[certificate] issue failed', { regId, error: result.error })
    return NextResponse.json({ error: 'Your certificate could not be prepared. Please try again later.' }, { status: 500 })
  }

  const ev = reg.events as any
  const org = ev?.organizations as any

  // The template the certificate was issued with; the org default only when
  // that template no longer exists, and the built-in default after that.
  let tmplPayload: CertificateTemplatePayload | null = null
  if (issued.template_id) {
    const { data, error } = await admin.from('certificate_templates').select('payload').eq('id', issued.template_id).maybeSingle()
    if (error) console.error('[certificate] issued template fetch failed', { regId, templateId: issued.template_id, error: error.message })
    tmplPayload = (data?.payload as CertificateTemplatePayload | undefined) ?? null
  }
  if (!tmplPayload) {
    const { data, error } = await admin.from('certificate_templates').select('payload').eq('org_id', org?.id ?? '').eq('is_default', true).maybeSingle()
    if (error) console.error('[certificate] template fetch failed', { regId, orgId: org?.id, error: error.message })
    tmplPayload = (data?.payload as CertificateTemplatePayload | undefined) ?? null
  }

  const templatePayload: CertificateTemplatePayload = tmplPayload ?? DEFAULT_CERTIFICATE_TEMPLATE.payload

  const props = {
    attendeeName: reg.attendee_name ?? reg.attendee_email ?? 'Attendee',
    eventTitle: ev?.title ?? 'Event',
    eventDate: ev?.start_at ? new Date(ev.start_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '',
    sessionsAttended: issued.sessions_attended,
    ceCredits: Number(issued.ce_credit_hours ?? 0),
    orgName: org?.name ?? 'Organizer',
    orgLogoUrl: org?.logo_url ?? null,
    verificationId: issued.verification_id,
    issueDate: new Date(issued.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    template: templatePayload,
  }

  const buffer = await renderToBuffer(createElement(Certificate, props) as ReactElement<any>)

  const filename = `certificate-${ev?.title?.replace(/[^a-z0-9]/gi, '-').toLowerCase() ?? regId}.pdf`

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
