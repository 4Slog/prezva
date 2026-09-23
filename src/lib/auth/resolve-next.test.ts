import { describe, it, expect } from 'vitest'
import { resolveNext } from './resolve-next'

const ORIGIN = 'https://prezva.app'

describe('resolveNext', () => {
  it('returns null for null and empty input', () => {
    expect(resolveNext(null, ORIGIN)).toBeNull()
    expect(resolveNext('', ORIGIN)).toBeNull()
  })

  it('returns a relative path unchanged', () => {
    expect(resolveNext('/e/summit/app', ORIGIN)).toBe('/e/summit/app')
    expect(resolveNext('/invite/abc?x=1&y=2', ORIGIN)).toBe('/invite/abc?x=1&y=2')
  })

  it("keeps today's behaviour for a relative '/'", () => {
    expect(resolveNext('/', ORIGIN)).toBe('/')
  })

  it('reduces a same-origin absolute URL to its path', () => {
    expect(resolveNext('https://prezva.app/me', ORIGIN)).toBe('/me')
  })

  it('preserves query string and hash on a same-origin absolute URL', () => {
    expect(resolveNext('https://prezva.app/invite/abc?x=1&y=2#top', ORIGIN)).toBe('/invite/abc?x=1&y=2#top')
  })

  it('treats the bare site_url fallback as no destination', () => {
    expect(resolveNext('https://prezva.app', ORIGIN)).toBeNull()
    expect(resolveNext('https://prezva.app/', ORIGIN)).toBeNull()
  })

  it('rejects a cross-origin absolute URL', () => {
    expect(resolveNext('https://evil.com/me', ORIGIN)).toBeNull()
    expect(resolveNext('https://prezva.app.evil.com/me', ORIGIN)).toBeNull()
    expect(resolveNext('http://prezva.app/me', ORIGIN)).toBeNull()
    expect(resolveNext('https://www.prezva.app/me', ORIGIN)).toBeNull()
  })

  it('rejects protocol-relative and backslash paths', () => {
    expect(resolveNext('//evil.com', ORIGIN)).toBeNull()
    expect(resolveNext('/\\evil.com', ORIGIN)).toBeNull()
  })

  it('rejects a same-origin absolute URL whose path is //evil.com', () => {
    expect(resolveNext('https://prezva.app//evil.com', ORIGIN)).toBeNull()
    expect(resolveNext('https://prezva.app//evil.com/me?x=1', ORIGIN)).toBeNull()
  })

  it('rejects javascript: and garbage input', () => {
    expect(resolveNext('javascript:alert(1)', ORIGIN)).toBeNull()
    expect(resolveNext('not a url', ORIGIN)).toBeNull()
    expect(resolveNext('evil.com/me', ORIGIN)).toBeNull()
    expect(resolveNext('https://', ORIGIN)).toBeNull()
  })

  it('treats /auth/callback as no destination (switch-window links)', () => {
    expect(resolveNext('/auth/callback', ORIGIN)).toBeNull()
    expect(resolveNext('/auth/callback?next=/me', ORIGIN)).toBeNull()
    expect(resolveNext('/auth/callback/', ORIGIN)).toBeNull()
    expect(resolveNext('https://prezva.app/auth/callback?next=%2Fme', ORIGIN)).toBeNull()
    expect(resolveNext('https://prezva.app/auth/callback', ORIGIN)).toBeNull()
  })

  it('does not catch paths that merely share the /auth/callback prefix', () => {
    expect(resolveNext('/auth/callbackfoo', ORIGIN)).toBe('/auth/callbackfoo')
    expect(resolveNext('https://prezva.app/auth/callbackfoo', ORIGIN)).toBe('/auth/callbackfoo')
  })

  it('never returns an absolute URL', () => {
    for (const input of ['https://prezva.app/me', '/me', 'https://prezva.app/a?b=https://evil.com']) {
      const out = resolveNext(input, ORIGIN)
      expect(out === null || out.startsWith('/')).toBe(true)
    }
  })
})
