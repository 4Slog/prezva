import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ghlRemoveContactTags } from './client'

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
