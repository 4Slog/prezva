import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('./client', () => ({
  ghlGet: vi.fn(),
  ghlPost: vi.fn(),
  ghlListCustomValues: vi.fn(),
  ghlCreateCustomValue: vi.fn(),
  ghlUpdateCustomValue: vi.fn(),
}))

import {
  ghlGet,
  ghlPost,
  ghlListCustomValues,
  ghlCreateCustomValue,
  ghlUpdateCustomValue,
} from './client'
import { provisionGhlOrgConfig } from './provisioner'

const WEBHOOK_SECRET_NAME = 'Prezva Webhook Secret'
const WEBHOOK_FIELD_KEY = '{{ custom_values.prezva_webhook_secret }}'
const EXISTING_HASH = 'existing-stored-hash'

function existingSecretValue(fieldKey: string = WEBHOOK_FIELD_KEY) {
  return { id: 'cv-secret', name: WEBHOOK_SECRET_NAME, fieldKey, value: 'whatever', locationId: 'loc-1' }
}

const LOCATION_ID = 'loc-1'
const ORG_ID = 'org-1'
const TOKEN = 'token-1'

const STAGE_NAMES = [
  'Registered',
  'Payment Pending',
  'Confirmed',
  'Checked In',
  'Attended Session',
  'No Show',
  'Certificate Issued',
  'Follow-Up Complete',
]

const STAGE_KEY_BY_NAME: Record<string, string> = {
  Registered: 'registered',
  'Payment Pending': 'paymentPending',
  Confirmed: 'confirmed',
  'Checked In': 'checkedIn',
  'Attended Session': 'attendedSession',
  'No Show': 'noShow',
  'Certificate Issued': 'certificateIssued',
  'Follow-Up Complete': 'followUpComplete',
}

const FIELD_DEFS = [
  { name: 'Prezva Event ID', model: 'opportunity', dataType: 'TEXT', key: 'prezvaEventId' },
  { name: 'Prezva Registration ID', model: 'opportunity', dataType: 'TEXT', key: 'prezvaRegistrationId' },
  { name: 'Prezva Ticket Type', model: 'opportunity', dataType: 'TEXT', key: 'prezvaTicketType' },
  { name: 'Prezva Payment Status', model: 'opportunity', dataType: 'TEXT', key: 'prezvaPaymentStatus' },
  { name: 'Prezva Source', model: 'opportunity', dataType: 'TEXT', key: 'prezvaSource' },
  { name: 'Prezva Last Sync Time', model: 'opportunity', dataType: 'TEXT', key: 'prezvaLastSyncTime' },
  { name: 'Prezva CE Credits', model: 'opportunity', dataType: 'NUMERICAL', key: 'prezvaCeCredits' },
  { name: 'Prezva Attendance %', model: 'opportunity', dataType: 'NUMERICAL', key: 'prezvaAttendancePct' },
  { name: 'Prezva Attendee Link', model: 'contact', dataType: 'TEXT', key: 'prezvaAttendeeLink' },
  { name: 'Prezva Event Date', model: 'contact', dataType: 'DATE', key: 'prezvaEventDate' },
  { name: 'Prezva Event Name', model: 'contact', dataType: 'TEXT', key: 'prezvaEventName' },
  { name: 'Prezva Completion Date', model: 'contact', dataType: 'TEXT', key: 'prezvaCompletionDate' },
] as const

function fullPipeline(stageNames: string[] = STAGE_NAMES) {
  return {
    id: 'pipe-existing',
    name: 'Events',
    stages: stageNames.map((name, i) => ({
      id: `stage-${STAGE_KEY_BY_NAME[name]}`,
      name,
      position: i,
    })),
  }
}

function fullCustomFields(presentKeys: string[] = FIELD_DEFS.map((f) => f.key)) {
  return {
    customFields: FIELD_DEFS.filter((f) => presentKeys.includes(f.key)).map((f) => ({
      id: `field-${f.key}`,
      name: f.name,
      model: f.model,
      dataType: f.dataType,
    })),
  }
}

// The same from() serves both the webhook-secret hash read (select/eq/
// maybeSingle) and the final config write (upsert). storedHash defaults to a
// value so the default path is "hash + custom value both present" — i.e. no
// mint, no writes — which keeps every pre-R55 test in this file untouched.
function makeAdmin(opts: { storedHash?: string | null } = {}) {
  const storedHash = opts.storedHash === undefined ? EXISTING_HASH : opts.storedHash
  const upsert = vi.fn().mockResolvedValue({ data: null, error: null })
  const from = vi.fn(() => {
    const chain: Record<string, unknown> = { upsert }
    chain.select = vi.fn().mockReturnValue(chain)
    chain.eq = vi.fn().mockReturnValue(chain)
    chain.maybeSingle = vi.fn().mockResolvedValue({ data: { webhook_secret_hash: storedHash }, error: null })
    return chain
  })
  return { admin: { from }, upsert, from }
}

describe('provisionGhlOrgConfig', () => {
  beforeEach(() => {
    vi.mocked(ghlGet).mockReset()
    vi.mocked(ghlPost).mockReset()
    // Default: the secret Custom Value already exists in GHL.
    vi.mocked(ghlListCustomValues).mockReset().mockResolvedValue([existingSecretValue()])
    vi.mocked(ghlCreateCustomValue).mockReset().mockResolvedValue(existingSecretValue())
    vi.mocked(ghlUpdateCustomValue).mockReset().mockResolvedValue(existingSecretValue())
  })

  it('(a) pipeline exists -> reused, not created', async () => {
    vi.mocked(ghlGet).mockImplementation(async (_token, path) => {
      if (path.startsWith('/opportunities/pipelines')) return { pipelines: [fullPipeline()] } as any
      if (path.includes('/customFields')) return fullCustomFields() as any
      if (path.startsWith('/calendars/')) return { calendars: [] } as any
      throw new Error(`unexpected ghlGet path: ${path}`)
    })

    const { admin, upsert } = makeAdmin()
    await provisionGhlOrgConfig(admin as any, TOKEN, ORG_ID, LOCATION_ID)

    expect(ghlPost).not.toHaveBeenCalled()
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ pipeline_id: 'pipe-existing' }),
      { onConflict: 'org_id' },
    )
  })

  it('(b) pipeline absent -> created with 8 stages, IDs captured', async () => {
    vi.mocked(ghlGet).mockImplementation(async (_token, path) => {
      if (path.startsWith('/opportunities/pipelines')) return { pipelines: [] } as any
      if (path.includes('/customFields')) return fullCustomFields() as any
      if (path.startsWith('/calendars/')) return { calendars: [] } as any
      throw new Error(`unexpected ghlGet path: ${path}`)
    })
    vi.mocked(ghlPost).mockImplementation(async (_token, path, body: any) => {
      if (path === '/opportunities/pipelines') {
        expect(body).toEqual({
          name: 'Events',
          locationId: LOCATION_ID,
          showInFunnel: true,
          showInPieChart: true,
          useOpportunityProbability: false,
          stages: STAGE_NAMES.map((name, i) => ({
            name,
            position: i,
            showInFunnel: true,
            showInPieChart: true,
          })),
        })
        return {
          id: 'pipe-new',
          name: 'Events',
          stages: STAGE_NAMES.map((name, i) => ({ id: `newstage-${STAGE_KEY_BY_NAME[name]}`, name, position: i })),
        } as any
      }
      throw new Error(`unexpected ghlPost path: ${path}`)
    })

    const { admin, upsert } = makeAdmin()
    await provisionGhlOrgConfig(admin as any, TOKEN, ORG_ID, LOCATION_ID)

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        pipeline_id: 'pipe-new',
        stage_ids: expect.objectContaining({
          registered: 'newstage-registered',
          noShow: 'newstage-noShow',
          followUpComplete: 'newstage-followUpComplete',
        }),
      }),
      { onConflict: 'org_id' },
    )
  })

  it('(b2) pipeline create response is WRAPPED {pipeline, traceId} -> unwrapped, stage ids captured', async () => {
    vi.mocked(ghlGet).mockImplementation(async (_token, path) => {
      if (path.startsWith('/opportunities/pipelines')) return { pipelines: [] } as any
      if (path.includes('/customFields')) return fullCustomFields() as any
      if (path.startsWith('/calendars/')) return { calendars: [] } as any
      throw new Error(`unexpected ghlGet path: ${path}`)
    })
    vi.mocked(ghlPost).mockImplementation(async (_token, path) => {
      if (path === '/opportunities/pipelines') {
        return {
          pipeline: {
            id: 'BgpFDGi6iHwohUoWLRvC',
            name: 'Events',
            stages: STAGE_NAMES.map((name, i) => ({
              id: `wrapped-${STAGE_KEY_BY_NAME[name]}`,
              name,
              position: i,
            })),
            locationId: LOCATION_ID,
          },
          traceId: 'trace-123',
        } as any
      }
      throw new Error(`unexpected ghlPost path: ${path}`)
    })

    const { admin, upsert } = makeAdmin()
    await provisionGhlOrgConfig(admin as any, TOKEN, ORG_ID, LOCATION_ID)

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        pipeline_id: 'BgpFDGi6iHwohUoWLRvC',
        stage_ids: expect.objectContaining({
          registered: 'wrapped-registered',
          noShow: 'wrapped-noShow',
          followUpComplete: 'wrapped-followUpComplete',
        }),
      }),
      { onConflict: 'org_id' },
    )
  })

  it('(c) fields: absent -> created, present -> reused', async () => {
    const presentKeys = ['prezvaEventId', 'prezvaRegistrationId', 'prezvaTicketType', 'prezvaPaymentStatus', 'prezvaSource']
    const missingDefs = FIELD_DEFS.filter((f) => !presentKeys.includes(f.key))

    vi.mocked(ghlGet).mockImplementation(async (_token, path) => {
      if (path.startsWith('/opportunities/pipelines')) return { pipelines: [fullPipeline()] } as any
      if (path.includes('/customFields')) return fullCustomFields(presentKeys) as any
      if (path.startsWith('/calendars/')) return { calendars: [] } as any
      throw new Error(`unexpected ghlGet path: ${path}`)
    })
    vi.mocked(ghlPost).mockImplementation(async (_token, path, body: any) => {
      if (path === `/locations/${LOCATION_ID}/customFields`) {
        const def = missingDefs.find((d) => d.name === body.name)
        expect(def).toBeTruthy()
        expect(body).toEqual({ name: def!.name, dataType: def!.dataType, model: def!.model })
        return { customField: { id: `created-${def!.key}`, name: def!.name, model: def!.model, dataType: def!.dataType } } as any
      }
      throw new Error(`unexpected ghlPost path: ${path}`)
    })

    const { admin, upsert } = makeAdmin()
    await provisionGhlOrgConfig(admin as any, TOKEN, ORG_ID, LOCATION_ID)

    expect(ghlPost).toHaveBeenCalledTimes(missingDefs.length)
    const call = upsert.mock.calls[0][0]
    expect(call.field_ids.prezvaEventId).toBe('field-prezvaEventId')
    expect(call.field_ids.prezvaCeCredits).toBe('created-prezvaCeCredits')
    expect(call.field_ids.prezvaAttendeeLink).toBe('created-prezvaAttendeeLink')
  })

  it('(d1) pipeline missing a required stage -> throws, no upsert', async () => {
    const incompleteStageNames = STAGE_NAMES.filter((n) => n !== 'No Show')
    vi.mocked(ghlGet).mockImplementation(async (_token, path) => {
      if (path.startsWith('/opportunities/pipelines')) return { pipelines: [fullPipeline(incompleteStageNames)] } as any
      if (path.includes('/customFields')) return fullCustomFields() as any
      if (path.startsWith('/calendars/')) return { calendars: [] } as any
      throw new Error(`unexpected ghlGet path: ${path}`)
    })

    const { admin, upsert } = makeAdmin()
    await expect(provisionGhlOrgConfig(admin as any, TOKEN, ORG_ID, LOCATION_ID)).rejects.toThrow(/No Show/)
    expect(upsert).not.toHaveBeenCalled()
  })

  it('(d2) field create response has no id -> throws, no upsert', async () => {
    vi.mocked(ghlGet).mockImplementation(async (_token, path) => {
      if (path.startsWith('/opportunities/pipelines')) return { pipelines: [fullPipeline()] } as any
      if (path.includes('/customFields')) return fullCustomFields([]) as any
      if (path.startsWith('/calendars/')) return { calendars: [] } as any
      throw new Error(`unexpected ghlGet path: ${path}`)
    })
    vi.mocked(ghlPost).mockImplementation(async (_token, path) => {
      if (path === `/locations/${LOCATION_ID}/customFields`) return {} as any
      throw new Error(`unexpected ghlPost path: ${path}`)
    })

    const { admin, upsert } = makeAdmin()
    await expect(provisionGhlOrgConfig(admin as any, TOKEN, ORG_ID, LOCATION_ID)).rejects.toThrow(/returned no id/)
    expect(upsert).not.toHaveBeenCalled()
  })

  it('(d3) wrapped pipeline create response missing id -> throws refusing to half-fire, no upsert', async () => {
    vi.mocked(ghlGet).mockImplementation(async (_token, path) => {
      if (path.startsWith('/opportunities/pipelines')) return { pipelines: [] } as any
      if (path.includes('/customFields')) return fullCustomFields() as any
      if (path.startsWith('/calendars/')) return { calendars: [] } as any
      throw new Error(`unexpected ghlGet path: ${path}`)
    })
    vi.mocked(ghlPost).mockImplementation(async (_token, path) => {
      if (path === '/opportunities/pipelines') {
        return {
          pipeline: {
            name: 'Events',
            stages: STAGE_NAMES.map((name, i) => ({ name, position: i })),
          },
          traceId: 'trace-456',
        } as any
      }
      throw new Error(`unexpected ghlPost path: ${path}`)
    })

    const { admin, upsert } = makeAdmin()
    await expect(provisionGhlOrgConfig(admin as any, TOKEN, ORG_ID, LOCATION_ID)).rejects.toThrow(
      /pipeline create returned no id — refusing to half-fire/,
    )
    expect(upsert).not.toHaveBeenCalled()
  })

  it('(e) full success -> single upsert with all 20 keys and provisioned_by', async () => {
    vi.mocked(ghlGet).mockImplementation(async (_token, path) => {
      if (path.startsWith('/opportunities/pipelines')) return { pipelines: [] } as any
      if (path.includes('/customFields')) return fullCustomFields([]) as any
      if (path.startsWith('/calendars/')) return { calendars: [] } as any
      throw new Error(`unexpected ghlGet path: ${path}`)
    })
    vi.mocked(ghlPost).mockImplementation(async (_token, path, body: any) => {
      if (path === '/opportunities/pipelines') {
        return {
          id: 'pipe-full',
          name: 'Events',
          stages: STAGE_NAMES.map((name, i) => ({ id: `s-${STAGE_KEY_BY_NAME[name]}`, name, position: i })),
        } as any
      }
      if (path === `/locations/${LOCATION_ID}/customFields`) {
        const def = FIELD_DEFS.find((d) => d.name === body.name)!
        return { customField: { id: `f-${def.key}`, name: def.name, model: def.model, dataType: def.dataType } } as any
      }
      throw new Error(`unexpected ghlPost path: ${path}`)
    })

    const { admin, upsert } = makeAdmin()
    await provisionGhlOrgConfig(admin as any, TOKEN, ORG_ID, LOCATION_ID)

    expect(upsert).toHaveBeenCalledTimes(1)
    const [row, opts] = upsert.mock.calls[0]
    expect(opts).toEqual({ onConflict: 'org_id' })
    expect(row.org_id).toBe(ORG_ID)
    expect(row.pipeline_id).toBe('pipe-full')
    expect(row.provisioned_by).toBe('oauth-provisioner')
    expect(Object.keys(row.stage_ids).sort()).toEqual(
      [
        'attendedSession', 'certificateIssued', 'checkedIn', 'confirmed',
        'followUpComplete', 'noShow', 'paymentPending', 'registered',
      ].sort(),
    )
    expect(Object.keys(row.field_ids).sort()).toEqual(FIELD_DEFS.map((f) => f.key).sort())
  })

  it('(f1) calendar exists by name -> id captured in upsert payload', async () => {
    vi.mocked(ghlGet).mockImplementation(async (_token, path) => {
      if (path.startsWith('/opportunities/pipelines')) return { pipelines: [fullPipeline()] } as any
      if (path.includes('/customFields')) return fullCustomFields() as any
      if (path.startsWith('/calendars/')) {
        return { calendars: [{ id: 'cal-123', name: 'Prezva Events' }, { id: 'cal-other', name: 'Some Other Calendar' }] } as any
      }
      throw new Error(`unexpected ghlGet path: ${path}`)
    })

    const { admin, upsert } = makeAdmin()
    await provisionGhlOrgConfig(admin as any, TOKEN, ORG_ID, LOCATION_ID)

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ calendar_id: 'cal-123' }),
      { onConflict: 'org_id' },
    )
  })

  it('(f2) calendar absent -> upsert payload has no calendar_id key, provisioning still succeeds', async () => {
    vi.mocked(ghlGet).mockImplementation(async (_token, path) => {
      if (path.startsWith('/opportunities/pipelines')) return { pipelines: [fullPipeline()] } as any
      if (path.includes('/customFields')) return fullCustomFields() as any
      if (path.startsWith('/calendars/')) return { calendars: [] } as any
      throw new Error(`unexpected ghlGet path: ${path}`)
    })

    const { admin, upsert } = makeAdmin()
    await provisionGhlOrgConfig(admin as any, TOKEN, ORG_ID, LOCATION_ID)

    expect(upsert).toHaveBeenCalledTimes(1)
    const row = upsert.mock.calls[0][0]
    expect('calendar_id' in row).toBe(false)
  })
})

// ── R55: webhook secret mint discipline ───────────────────────────────────────

describe('provisionGhlOrgConfig — webhook secret (R55)', () => {
  const HAPPY_GHL_GET = async (_token: string, path: string) => {
    if (path.startsWith('/opportunities/pipelines')) return { pipelines: [fullPipeline()] } as any
    if (path.includes('/customFields')) return fullCustomFields() as any
    if (path.startsWith('/calendars/')) return { calendars: [] } as any
    throw new Error(`unexpected ghlGet path: ${path}`)
  }

  beforeEach(() => {
    vi.mocked(ghlGet).mockReset().mockImplementation(HAPPY_GHL_GET as any)
    vi.mocked(ghlPost).mockReset()
    vi.mocked(ghlListCustomValues).mockReset().mockResolvedValue([existingSecretValue()])
    vi.mocked(ghlCreateCustomValue).mockReset().mockResolvedValue(existingSecretValue())
    vi.mocked(ghlUpdateCustomValue).mockReset().mockResolvedValue(existingSecretValue())
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // The load-bearing case: re-provisioning is routine (OAuth callback AND
  // embedded claim both call this), so a mint here would silently invalidate
  // the live workflow's secret on every re-run.
  it('hash present AND custom value present -> no mint, no create, no update', async () => {
    const { admin, upsert } = makeAdmin({ storedHash: EXISTING_HASH })

    await provisionGhlOrgConfig(admin as any, TOKEN, ORG_ID, LOCATION_ID)

    expect(ghlCreateCustomValue).not.toHaveBeenCalled()
    expect(ghlUpdateCustomValue).not.toHaveBeenCalled()
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ webhook_secret_hash: EXISTING_HASH }),
      { onConflict: 'org_id' },
    )
  })

  it('custom value absent -> mints, CREATEs the value, stores a fresh sha256 hash', async () => {
    vi.mocked(ghlListCustomValues).mockResolvedValue([])
    const { admin, upsert } = makeAdmin({ storedHash: null })

    await provisionGhlOrgConfig(admin as any, TOKEN, ORG_ID, LOCATION_ID)

    expect(ghlUpdateCustomValue).not.toHaveBeenCalled()
    expect(ghlCreateCustomValue).toHaveBeenCalledWith(
      TOKEN, LOCATION_ID, WEBHOOK_SECRET_NAME, expect.stringMatching(/^[0-9a-f]{64}$/),
    )

    const mintedSecret = vi.mocked(ghlCreateCustomValue).mock.calls[0][3]
    const row = upsert.mock.calls[0][0]
    // The stored value is the HASH of the minted secret — never the secret.
    expect(row.webhook_secret_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(row.webhook_secret_hash).not.toBe(mintedSecret)
  })

  it('custom value present but hash absent -> mints fresh and UPDATEs the existing value by id', async () => {
    vi.mocked(ghlListCustomValues).mockResolvedValue([existingSecretValue()])
    const { admin, upsert } = makeAdmin({ storedHash: null })

    await provisionGhlOrgConfig(admin as any, TOKEN, ORG_ID, LOCATION_ID)

    expect(ghlCreateCustomValue).not.toHaveBeenCalled()
    expect(ghlUpdateCustomValue).toHaveBeenCalledWith(
      TOKEN, LOCATION_ID, 'cv-secret', WEBHOOK_SECRET_NAME, expect.stringMatching(/^[0-9a-f]{64}$/),
    )
    expect(upsert.mock.calls[0][0].webhook_secret_hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('matches an existing value by fieldKey slug even when the display name was changed', async () => {
    vi.mocked(ghlListCustomValues).mockResolvedValue([
      { id: 'cv-renamed', name: 'Renamed By A Human', fieldKey: WEBHOOK_FIELD_KEY, value: 'x' },
    ])
    const { admin } = makeAdmin({ storedHash: EXISTING_HASH })

    await provisionGhlOrgConfig(admin as any, TOKEN, ORG_ID, LOCATION_ID)

    // Found via the slug, so treated as present: no duplicate create.
    expect(ghlCreateCustomValue).not.toHaveBeenCalled()
  })

  it('fieldKey mismatch logs loudly but does NOT throw — provisioning still completes', async () => {
    vi.mocked(ghlListCustomValues).mockResolvedValue([])
    vi.mocked(ghlCreateCustomValue).mockResolvedValue({
      id: 'cv-new', name: WEBHOOK_SECRET_NAME, fieldKey: '{{ custom_values.something_else }}', value: 'x',
    })
    const { admin, upsert } = makeAdmin({ storedHash: null })

    await expect(provisionGhlOrgConfig(admin as any, TOKEN, ORG_ID, LOCATION_ID)).resolves.toBeUndefined()

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('fieldKey'))
    expect(upsert).toHaveBeenCalledTimes(1)
  })

  it('accepts a fieldKey that differs only in brace whitespace', async () => {
    vi.mocked(ghlListCustomValues).mockResolvedValue([])
    vi.mocked(ghlCreateCustomValue).mockResolvedValue({
      id: 'cv-new', name: WEBHOOK_SECRET_NAME, fieldKey: '{{custom_values.prezva_webhook_secret}}', value: 'x',
    })
    const { admin } = makeAdmin({ storedHash: null })

    await provisionGhlOrgConfig(admin as any, TOKEN, ORG_ID, LOCATION_ID)

    expect(console.error).not.toHaveBeenCalled()
  })

  // Non-fatal by design: a GHL outage must not cost the org its pipeline and
  // field IDs, and must not clobber a hash that is already stored.
  it('a GHL failure leaves webhook_secret_hash out of the payload entirely, and provisioning still succeeds', async () => {
    vi.mocked(ghlListCustomValues).mockRejectedValue(new Error('GHL 503'))
    const { admin, upsert } = makeAdmin({ storedHash: EXISTING_HASH })

    await provisionGhlOrgConfig(admin as any, TOKEN, ORG_ID, LOCATION_ID)

    expect(upsert).toHaveBeenCalledTimes(1)
    const row = upsert.mock.calls[0][0]
    expect('webhook_secret_hash' in row).toBe(false)
    expect(row.pipeline_id).toBe('pipe-existing')
  })
})

// R57: the certificate merge fields are referenced BY SLUG in the GHL
// certificate template, and GHL's auto-slug is the only authority on what that
// slug is — "Prezva Attendance %" slugged to `opportunity.prezva_attendance_`,
// not `_pct`. The provisioner therefore checks the returned fieldKey instead of
// predicting it, loudly but non-fatally.
describe('provisionGhlOrgConfig — certificate merge-field slugs (R57)', () => {
  const CERT_DEFS = [
    { key: 'prezvaEventName', name: 'Prezva Event Name', expected: 'contact.prezva_event_name' },
    { key: 'prezvaCompletionDate', name: 'Prezva Completion Date', expected: 'contact.prezva_completion_date' },
  ]

  beforeEach(() => {
    vi.mocked(ghlGet).mockReset()
    vi.mocked(ghlPost).mockReset()
    vi.mocked(ghlListCustomValues).mockReset().mockResolvedValue([existingSecretValue()])
    vi.mocked(ghlCreateCustomValue).mockReset().mockResolvedValue(existingSecretValue())
    vi.mocked(ghlUpdateCustomValue).mockReset().mockResolvedValue(existingSecretValue())
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // fieldKeyFor lets a test hand back a deliberately wrong slug for one field.
  function mockCreateWith(fieldKeyFor: (key: string) => string | undefined) {
    vi.mocked(ghlGet).mockImplementation(async (_token, path) => {
      if (path.startsWith('/opportunities/pipelines')) return { pipelines: [] } as any
      if (path.includes('/customFields')) return fullCustomFields([]) as any
      if (path.startsWith('/calendars/')) return { calendars: [] } as any
      throw new Error(`unexpected ghlGet path: ${path}`)
    })
    vi.mocked(ghlPost).mockImplementation(async (_token, path, body: any) => {
      if (path === '/opportunities/pipelines') {
        return {
          id: 'pipe-full',
          name: 'Events',
          stages: STAGE_NAMES.map((name, i) => ({ id: `s-${STAGE_KEY_BY_NAME[name]}`, name, position: i })),
        } as any
      }
      if (path === `/locations/${LOCATION_ID}/customFields`) {
        const def = FIELD_DEFS.find((d) => d.name === body.name)!
        return {
          customField: {
            id: `f-${def.key}`,
            name: def.name,
            model: def.model,
            dataType: def.dataType,
            fieldKey: fieldKeyFor(def.key),
          },
        } as any
      }
      throw new Error(`unexpected ghlPost path: ${path}`)
    })
  }

  it('creates both certificate fields as contact TEXT fields', async () => {
    mockCreateWith((key) => CERT_DEFS.find((d) => d.key === key)?.expected)
    const { admin, upsert } = makeAdmin()

    await provisionGhlOrgConfig(admin as any, TOKEN, ORG_ID, LOCATION_ID)

    for (const def of CERT_DEFS) {
      expect(ghlPost).toHaveBeenCalledWith(
        TOKEN,
        `/locations/${LOCATION_ID}/customFields`,
        { name: def.name, dataType: 'TEXT', model: 'contact' },
      )
    }
    const [row] = upsert.mock.calls[0]
    expect(row.field_ids.prezvaEventName).toBe('f-prezvaEventName')
    expect(row.field_ids.prezvaCompletionDate).toBe('f-prezvaCompletionDate')
  })

  it('stays silent when GHL returns the expected slugs', async () => {
    mockCreateWith((key) => CERT_DEFS.find((d) => d.key === key)?.expected)
    const { admin } = makeAdmin()

    await provisionGhlOrgConfig(admin as any, TOKEN, ORG_ID, LOCATION_ID)

    const slugComplaints = vi.mocked(console.error).mock.calls
      .filter(([msg]) => typeof msg === 'string' && msg.includes('fieldKey'))
    expect(slugComplaints).toHaveLength(0)
  })

  it('logs the ACTUAL slug and still stores the id when GHL slugs it differently', async () => {
    // The Attendance % scenario, one field over.
    mockCreateWith((key) => (key === 'prezvaCompletionDate' ? 'contact.prezva_completion_' : undefined))
    const { admin, upsert } = makeAdmin()

    await provisionGhlOrgConfig(admin as any, TOKEN, ORG_ID, LOCATION_ID)

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('contact.prezva_completion_'),
    )
    // Non-fatal: the upsert still lands, so a slug mismatch never costs us the
    // pipeline and field IDs.
    expect(upsert).toHaveBeenCalledTimes(1)
    const [row] = upsert.mock.calls[0]
    expect(row.field_ids.prezvaCompletionDate).toBe('f-prezvaCompletionDate')
  })

  it('does not complain when GHL omits fieldKey — absent is unverifiable, not wrong', async () => {
    mockCreateWith(() => undefined)
    const { admin, upsert } = makeAdmin()

    await provisionGhlOrgConfig(admin as any, TOKEN, ORG_ID, LOCATION_ID)

    const slugComplaints = vi.mocked(console.error).mock.calls
      .filter(([msg]) => typeof msg === 'string' && msg.includes('fieldKey'))
    expect(slugComplaints).toHaveLength(0)
    expect(upsert).toHaveBeenCalledTimes(1)
  })
})
