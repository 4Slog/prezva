import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createElement, type ReactElement } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { checkEligibility } from '@/lib/certificates/eligibility'
import { issueOrGetCertificate } from '@/lib/certificates/actions'
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

  const { data: reg } = await admin
    .from('registrations')
    .select('id, user_id, certificate_token, attendee_name, attendee_email, events(id, title, start_at, certificate_enabled, certificate_min_session_attendance_pct, organizations(name, logo_url))')
    .eq('id', regId)
    .maybeSingle()

  if (!reg) return new NextResponse('Not found', { status: 404 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const ownerMatch = user?.id === reg.user_id
  const tokenMatch = token && token === reg.certificate_token
  if (!ownerMatch && !tokenMatch) return new NextResponse('Forbidden', { status: 403 })

  const eligibility = await checkEligibility(regId)
  if (!eligibility.eligible) {
    return new NextResponse(
      JSON.stringify({ error: eligibility.reason ?? 'Certificate not yet earned' }),
      { status: 412, headers: { 'Content-Type': 'application/json' } }
    )
  }

  await issueOrGetCertificate(regId)

  const { data: issued } = await admin
    .from('issued_certificates')
    .select('verification_id')
    .eq('registration_id', regId)
    .maybeSingle()

  const ev = reg.events as any
  const org = ev?.organizations as any

  const { data: tmplRow } = await admin
    .from('certificate_templates')
    .select('payload')
    .eq('org_id', org?.id ?? '')
    .eq('is_default', true)
    .maybeSingle()

  const templatePayload: CertificateTemplatePayload = tmplRow?.payload ?? DEFAULT_CERTIFICATE_TEMPLATE.payload

  const props = {
    attendeeName: reg.attendee_name ?? reg.attendee_email ?? 'Attendee',
    eventTitle: ev?.title ?? 'Event',
    eventDate: ev?.start_at ? new Date(ev.start_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '',
    sessionsAttended: eligibility.sessionsAttended,
    ceCredits: eligibility.ceCredits,
    orgName: org?.name ?? 'Organizer',
    orgLogoUrl: org?.logo_url ?? null,
    verificationId: issued?.verification_id ?? 'N/A',
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
