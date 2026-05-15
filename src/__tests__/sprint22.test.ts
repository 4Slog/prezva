import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

const SRC = join(process.cwd(), 'src')
const MIGRATIONS = join(process.cwd(), 'supabase/migrations')

describe('Sprint 22 — Certificate Engine', () => {
  // Migration
  it('migration 0023 exists with certificate tables', () => {
    const path = join(MIGRATIONS, '0023_sprint22_certificates.sql')
    expect(existsSync(path)).toBe(true)
    const sql = readFileSync(path, 'utf-8')
    expect(sql).toContain('certificate_templates')
    expect(sql).toContain('issued_certificates')
    expect(sql).toContain('verification_id')
    expect(sql).toContain('enable row level security')
  })

  it('migration 0023 adds certificate columns to events + sessions', () => {
    const sql = readFileSync(join(MIGRATIONS, '0023_sprint22_certificates.sql'), 'utf-8')
    expect(sql).toContain('certificate_enabled')
    expect(sql).toContain('certificate_min_session_attendance_pct')
    expect(sql).toContain('ce_credit_hours')
  })

  // Template constant
  it('DEFAULT_CERTIFICATE_TEMPLATE is defined with required payload keys', () => {
    const path = join(SRC, 'lib/templates/certificates.ts')
    expect(existsSync(path)).toBe(true)
    const src = readFileSync(path, 'utf-8')
    expect(src).toContain('DEFAULT_CERTIFICATE_TEMPLATE')
    expect(src).toContain('accent_color')
    expect(src).toContain('{attendee_name}')
    expect(src).toContain('{ce_credit_hours}')
    expect(src).toContain('{verification_url}')
  })

  // PDF component
  it('Certificate PDF component exists with required props', () => {
    const path = join(SRC, 'lib/pdf/Certificate.tsx')
    expect(existsSync(path)).toBe(true)
    const src = readFileSync(path, 'utf-8')
    expect(src).toContain('Document')
    expect(src).toContain('Page')
    expect(src).toContain('attendeeName')
    expect(src).toContain('verificationId')
    expect(src).toContain('CertificateProps')
  })

  // Eligibility checker
  it('eligibility module exists and checks session attendance', () => {
    const path = join(SRC, 'lib/certificates/eligibility.ts')
    expect(existsSync(path)).toBe(true)
    const src = readFileSync(path, 'utf-8')
    expect(src).toContain('checkEligibility')
    expect(src).toContain('certificate_enabled')
    expect(src).toContain('check_ins')
    expect(src).toContain('EligibilityResult')
  })

  // Certificate actions
  it('certificate actions module exports required functions', () => {
    const path = join(SRC, 'lib/certificates/actions.ts')
    expect(existsSync(path)).toBe(true)
    const src = readFileSync(path, 'utf-8')
    expect(src).toContain("'use server'")
    expect(src).toContain('issueOrGetCertificate')
    expect(src).toContain('getMyIssuedCertificates')
    expect(src).toContain('listOrgCertificateTemplates')
    expect(src).toContain('upsertCertificateTemplate')
    expect(src).toContain('getOrCreateDefaultTemplate')
  })

  // API route
  it('certificate API route exists with auth + eligibility check', () => {
    const path = join(SRC, 'app/api/certificates/[regId]/route.ts')
    expect(existsSync(path)).toBe(true)
    const src = readFileSync(path, 'utf-8')
    expect(src).toContain('renderToBuffer')
    expect(src).toContain('application/pdf')
    expect(src).toContain('certificate_token')
    expect(src).toContain('412')
    expect(src).toContain('checkEligibility')
  })

  // Certificate page + client
  it('/e/[slug]/certificate page exists', () => {
    const path = join(SRC, 'app/e/[slug]/certificate/page.tsx')
    expect(existsSync(path)).toBe(true)
    const src = readFileSync(path, 'utf-8')
    expect(src).toContain('certificate_enabled')
    expect(src).toContain('CertificateClient')
  })

  it('/e/[slug]/certificate client handles eligibility states', () => {
    const path = join(SRC, 'app/e/[slug]/certificate/client.tsx')
    expect(existsSync(path)).toBe(true)
    const src = readFileSync(path, 'utf-8')
    expect(src).toContain("'use client'")
    expect(src).toContain('eligible')
    expect(src).toContain('not_eligible')
    expect(src).toContain('certificate_token')
  })

  // /verify route
  it('/verify/[verificationId] page exists', () => {
    const path = join(SRC, 'app/verify/[verificationId]/page.tsx')
    expect(existsSync(path)).toBe(true)
    const src = readFileSync(path, 'utf-8')
    expect(src).toContain('verification_id')
    expect(src).toContain('Valid Certificate')
    expect(src).toContain('Certificate Not Found')
    expect(src).toContain('createAdminClient')
  })

  // Org certificates UI
  it('org certificates page exists', () => {
    const path = join(SRC, 'app/(dashboard)/orgs/[slug]/certificates/page.tsx')
    expect(existsSync(path)).toBe(true)
    const src = readFileSync(path, 'utf-8')
    expect(src).toContain('listOrgCertificateTemplates')
    expect(src).toContain('CertificatesClient')
  })

  it('org certificates client has template editor with placeholders', () => {
    const path = join(SRC, 'app/(dashboard)/orgs/[slug]/certificates/client.tsx')
    expect(existsSync(path)).toBe(true)
    const src = readFileSync(path, 'utf-8')
    expect(src).toContain("'use client'")
    expect(src).toContain('upsertCertificateTemplate')
    expect(src).toContain('{attendee_name}')
  })

  // Event settings
  it('event settings page includes certificate settings section', () => {
    const path = join(SRC, 'app/(dashboard)/events/[slug]/settings/page.tsx')
    expect(existsSync(path)).toBe(true)
    const src = readFileSync(path, 'utf-8')
    expect(src).toContain('certificate_enabled')
    expect(src).toContain('certificate_min_session_attendance_pct')
    expect(src).toContain('CertificateSettingsSection')
  })

  // Wallet certs
  it('/me/wallet shows issued certificates', () => {
    const path = join(SRC, 'app/me/wallet/page.tsx')
    expect(existsSync(path)).toBe(true)
    const src = readFileSync(path, 'utf-8')
    expect(src).toContain('getMyIssuedCertificates')
    expect(src).toContain('verification_id')
    expect(src).toContain('/verify/')
  })

  // Confirmation page cert link
  it('confirmation page shows certificate link when cert enabled', () => {
    const path = join(SRC, 'app/e/[slug]/confirmation/page.tsx')
    expect(existsSync(path)).toBe(true)
    const src = readFileSync(path, 'utf-8')
    expect(src).toContain('certificate_enabled')
    expect(src).toContain('/certificate')
  })

  // Trigger.dev email job
  it('certificate email trigger job exists', () => {
    const path = join(SRC, 'trigger/jobs/certificate-email.ts')
    expect(existsSync(path)).toBe(true)
    const src = readFileSync(path, 'utf-8')
    expect(src).toContain('sendCertificateEmail')
    expect(src).toContain('certDownloadUrl')
    expect(src).toContain('verifyUrl')
  })
})
