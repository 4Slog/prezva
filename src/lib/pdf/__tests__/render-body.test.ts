import { describe, it, expect } from 'vitest'
import { renderBody } from '../Certificate'
import { DEFAULT_CERTIFICATE_TEMPLATE } from '@/lib/templates/certificates'
import type { CertificateProps } from '../Certificate'

const BASE_PROPS: CertificateProps = {
  attendeeName: 'Yolanda Smith',
  eventTitle: 'GAPP Annual Summit 2026',
  eventDate: 'June 8, 2026',
  sessionsAttended: 2,
  ceCredits: 2,
  orgName: 'GAPP',
  verificationId: 'abc123',
  issueDate: 'May 29, 2026',
  template: DEFAULT_CERTIFICATE_TEMPLATE.payload,
}

describe('renderBody — bilingual token resolution', () => {
  it('resolves GAPP double-brace body tokens', () => {
    const body = 'This certifies that {{attendee_name}} has successfully completed the required sessions at the {{event_title}} and earned {{ce_hours}} CE credit hours.'
    const result = renderBody(body, BASE_PROPS)
    expect(result).toContain('Yolanda Smith')
    expect(result).toContain('GAPP Annual Summit 2026')
    expect(result).toContain('earned 2 CE')
    expect(result).not.toMatch(/[{}]/)
  })

  it('resolves GAPP double-brace footer tokens', () => {
    const footer = 'Issued by GAPP on {{issue_date}}'
    const result = renderBody(footer, BASE_PROPS)
    expect(result).toContain('Issued by GAPP on May 29, 2026')
    expect(result).not.toMatch(/[{}]/)
  })

  it('resolves DEFAULT single-brace body tokens (backward compat)', () => {
    const result = renderBody(DEFAULT_CERTIFICATE_TEMPLATE.payload.body, BASE_PROPS)
    expect(result).toContain('Yolanda Smith')
    expect(result).toContain('GAPP Annual Summit 2026')
    expect(result).not.toMatch(/[{}]/)
  })

  it('resolves DEFAULT single-brace footer tokens (backward compat)', () => {
    const result = renderBody(DEFAULT_CERTIFICATE_TEMPLATE.payload.footer, BASE_PROPS)
    expect(result).toContain('GAPP')
    expect(result).toContain('abc123')
    expect(result).not.toMatch(/[{}]/)
  })

  it('leaves unknown tokens untouched', () => {
    const result = renderBody('Hello {{unknown_token}} world', BASE_PROPS)
    expect(result).toBe('Hello {{unknown_token}} world')
  })
})
