import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  ghlRemoveContactTags,
  ghlListCustomValues,
  ghlCreateCustomValue,
  ghlUpdateCustomValue,
} from './client'

describe('ghlRemoveContactTags', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('early-returns [] without calling fetch when tags is empty', async () => {
    const result = await ghlRemoveContactTags('test-token', 'contact-1', [])

    expect(result).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends a DELETE with a JSON tags body and returns the response tags', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ tags: ['prezva-checked-in'] }),
    })

    const result = await ghlRemoveContactTags('test-token', 'contact-1', ['prezva-no-show'])

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/contacts/contact-1/tags'),
      expect.objectContaining({
        method: 'DELETE',
        body: JSON.stringify({ tags: ['prezva-no-show'] }),
      }),
    )
    expect(result).toEqual(['prezva-checked-in'])
  })

  it('throws with status and body text on a failed response', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => 'unprocessable',
    })

    await expect(ghlRemoveContactTags('test-token', 'contact-1', ['prezva-no-show'])).rejects.toThrow(
      /GHL remove contact tags failed: 422 — unprocessable/,
    )
  })
})

// ── Custom Values (R55) ───────────────────────────────────────────────────────

describe('custom value helpers', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('ghlListCustomValues GETs the location path and unwraps customValues', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        customValues: [
          { id: 'cv-1', name: 'Prezva Webhook Secret', fieldKey: '{{ custom_values.prezva_webhook_secret }}', value: 'abc' },
        ],
      }),
    })

    const result = await ghlListCustomValues('test-token', 'loc-1')

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/locations/loc-1/customValues'),
      expect.anything(),
    )
    expect(result).toHaveLength(1)
    expect(result[0].fieldKey).toBe('{{ custom_values.prezva_webhook_secret }}')
  })

  it('ghlListCustomValues returns [] when the response carries no customValues key', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) })

    expect(await ghlListCustomValues('test-token', 'loc-1')).toEqual([])
  })

  it('ghlCreateCustomValue POSTs {name, value} and returns the created customValue', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        customValue: {
          id: 'cv-new',
          name: 'Prezva Webhook Secret',
          fieldKey: '{{ custom_values.prezva_webhook_secret }}',
          value: 'secret-plain',
          locationId: 'loc-1',
        },
      }),
    })

    const result = await ghlCreateCustomValue('test-token', 'loc-1', 'Prezva Webhook Secret', 'secret-plain')

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/locations/loc-1/customValues'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Prezva Webhook Secret', value: 'secret-plain' }),
      }),
    )
    expect(result?.id).toBe('cv-new')
  })

  it('ghlUpdateCustomValue PUTs to the id-scoped path', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        customValue: { id: 'cv-1', name: 'Prezva Webhook Secret', fieldKey: '{{ custom_values.prezva_webhook_secret }}', value: 'rotated' },
      }),
    })

    const result = await ghlUpdateCustomValue('test-token', 'loc-1', 'cv-1', 'Prezva Webhook Secret', 'rotated')

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/locations/loc-1/customValues/cv-1'),
      expect.objectContaining({ method: 'PUT' }),
    )
    expect(result?.value).toBe('rotated')
  })

  // Error-body parity (R55): ghlGet already surfaced the response body on
  // failure; POST/PUT/DELETE threw status-only, which made a failed
  // provisioning call nearly undiagnosable. One non-GET verb asserted here.
  it('a failed POST includes the response body text in the thrown error, not just the status', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => '{"message":"name already exists"}',
    })

    await expect(
      ghlCreateCustomValue('test-token', 'loc-1', 'Prezva Webhook Secret', 'x'),
    ).rejects.toThrow(/422 — \{"message":"name already exists"\}/)
  })
})
