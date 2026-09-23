// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const mockSignUp = vi.fn()
const mockSignInWithOtp = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { signUp: mockSignUp, signInWithOtp: mockSignInWithOtp },
  })),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/auth/post-login-redirect', () => ({ getPostLoginRedirect: vi.fn() }))

import { signUp, sendMagicLink } from './actions'

const APP_URL = 'https://prezva.app'

function form(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

describe('auth email redirects (I10 R77)', () => {
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_APP_URL = APP_URL
    mockSignUp.mockResolvedValue({ error: null })
    mockSignInWithOtp.mockResolvedValue({ error: null })
  })

  afterEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = originalAppUrl
  })

  describe('signUp', () => {
    const base = { email: 'a@test.com', password: 'password123', full_name: 'A' }

    it('sets emailRedirectTo to APP_URL + next when next is given', async () => {
      await signUp(null, form({ ...base, next: '/invite/abc?x=1' }))
      const options = mockSignUp.mock.calls[0][0].options
      expect(options.emailRedirectTo).toBe(`${APP_URL}/invite/abc?x=1`)
      expect(options.data).toEqual({ full_name: 'A' })
    })

    it('omits emailRedirectTo when there is no next', async () => {
      await signUp(null, form(base))
      expect(mockSignUp.mock.calls[0][0].options).not.toHaveProperty('emailRedirectTo')
    })

    it('omits emailRedirectTo when next fails the guard', async () => {
      await signUp(null, form({ ...base, next: '//evil.com' }))
      expect(mockSignUp.mock.calls[0][0].options).not.toHaveProperty('emailRedirectTo')
    })

    it('never points at /auth/callback', async () => {
      await signUp(null, form({ ...base, next: '/me' }))
      expect(JSON.stringify(mockSignUp.mock.calls[0][0])).not.toContain('/auth/callback')
    })
  })

  describe('sendMagicLink', () => {
    it('sets emailRedirectTo to APP_URL + next when next is given', async () => {
      await sendMagicLink(null, form({ email: 'a@test.com', next: '/e/summit' }))
      const options = mockSignInWithOtp.mock.calls[0][0].options
      expect(options.emailRedirectTo).toBe(`${APP_URL}/e/summit`)
      expect(options.shouldCreateUser).toBe(true)
    })

    it('omits emailRedirectTo when there is no next', async () => {
      await sendMagicLink(null, form({ email: 'a@test.com' }))
      const options = mockSignInWithOtp.mock.calls[0][0].options
      expect(options).not.toHaveProperty('emailRedirectTo')
      expect(options.shouldCreateUser).toBe(true)
    })

    it('omits emailRedirectTo when next fails the guard', async () => {
      await sendMagicLink(null, form({ email: 'a@test.com', next: '/\\evil.com' }))
      expect(mockSignInWithOtp.mock.calls[0][0].options).not.toHaveProperty('emailRedirectTo')
    })

    it('never points at /auth/callback', async () => {
      await sendMagicLink(null, form({ email: 'a@test.com', next: '/me' }))
      expect(JSON.stringify(mockSignInWithOtp.mock.calls[0][0])).not.toContain('/auth/callback')
    })
  })
})

describe('committed auth email templates (R78)', () => {
  const TEMPLATES = join(process.cwd(), 'supabase/templates')
  const HREF = '/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}'

  for (const file of ['magic_link.html', 'confirmation.html']) {
    it(`${file} links to /auth/confirm with token_hash and never uses ConfirmationURL`, () => {
      const content = readFileSync(join(TEMPLATES, file), 'utf-8')
      expect(content).toContain(HREF)
      expect(content).not.toContain('.ConfirmationURL')
    })
  }
})
