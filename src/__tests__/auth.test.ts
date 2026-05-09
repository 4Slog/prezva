import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const SRC = join(process.cwd(), 'src')

describe('Auth module — file structure', () => {
  it('middleware.ts exists at src root', () => {
    expect(existsSync(join(SRC, 'middleware.ts'))).toBe(true)
  })

  it('auth actions file exists', () => {
    expect(existsSync(join(SRC, 'lib/auth/actions.ts'))).toBe(true)
  })

  it('get-user helper exists', () => {
    expect(existsSync(join(SRC, 'lib/auth/get-user.ts'))).toBe(true)
  })

  it('supabase client helper exists', () => {
    expect(existsSync(join(SRC, 'lib/supabase/client.ts'))).toBe(true)
  })

  it('supabase server helper exists', () => {
    expect(existsSync(join(SRC, 'lib/supabase/server.ts'))).toBe(true)
  })

  it('supabase middleware helper exists', () => {
    expect(existsSync(join(SRC, 'lib/supabase/middleware.ts'))).toBe(true)
  })

  it('auth callback route exists', () => {
    expect(existsSync(join(SRC, 'app/auth/callback/route.ts'))).toBe(true)
  })

  it('login page exists', () => {
    expect(existsSync(join(SRC, 'app/(auth)/login/page.tsx'))).toBe(true)
  })

  it('signup page exists', () => {
    expect(existsSync(join(SRC, 'app/(auth)/signup/page.tsx'))).toBe(true)
  })

  it('forgot-password page exists', () => {
    expect(existsSync(join(SRC, 'app/(auth)/forgot-password/page.tsx'))).toBe(true)
  })

  it('update-password page exists', () => {
    expect(existsSync(join(SRC, 'app/auth/update-password/page.tsx'))).toBe(true)
  })

  it('dashboard page exists', () => {
    expect(existsSync(join(SRC, 'app/(dashboard)/dashboard/page.tsx'))).toBe(true)
  })

  it('dashboard layout exists and requires auth', () => {
    const content = readFileSync(join(SRC, 'app/(dashboard)/layout.tsx'), 'utf-8')
    expect(content).toContain('requireUser')
  })

  it('database types file exists', () => {
    expect(existsSync(join(SRC, 'types/database.ts'))).toBe(true)
  })
})

describe('Auth module — content checks', () => {
  it('actions.ts exports all required functions', () => {
    const content = readFileSync(join(SRC, 'lib/auth/actions.ts'), 'utf-8')
    expect(content).toContain('export async function signIn')
    expect(content).toContain('export async function signUp')
    expect(content).toContain('export async function signOut')
    expect(content).toContain('export async function resetPassword')
    expect(content).toContain('export async function updatePassword')
  })

  it('actions.ts is a server action', () => {
    const content = readFileSync(join(SRC, 'lib/auth/actions.ts'), 'utf-8')
    expect(content).toContain("'use server'")
  })

  it('middleware.ts matches all routes except static assets', () => {
    const content = readFileSync(join(SRC, 'middleware.ts'), 'utf-8')
    expect(content).toContain('updateSession')
    expect(content).toContain('matcher')
  })

  it('auth callback exchanges code for session', () => {
    const content = readFileSync(join(SRC, 'app/auth/callback/route.ts'), 'utf-8')
    expect(content).toContain('exchangeCodeForSession')
  })

  it('get-user exports requireUser that redirects unauthenticated users', () => {
    const content = readFileSync(join(SRC, 'lib/auth/get-user.ts'), 'utf-8')
    expect(content).toContain('requireUser')
    expect(content).toContain('redirect')
  })

  it('supabase server client uses SSR cookies', () => {
    const content = readFileSync(join(SRC, 'lib/supabase/server.ts'), 'utf-8')
    expect(content).toContain('createServerClient')
    expect(content).toContain('cookies')
  })

  it('database types exports core interfaces', () => {
    const content = readFileSync(join(SRC, 'types/database.ts'), 'utf-8')
    expect(content).toContain('Profile')
    expect(content).toContain('Organization')
    expect(content).toContain('Event')
    expect(content).toContain('Registration')
  })
})
