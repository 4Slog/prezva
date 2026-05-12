import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const SRC = join(process.cwd(), 'src')

describe('UserMenu component', () => {
  it('component file exists', () => {
    expect(existsSync(join(SRC, 'components/auth/UserMenu.tsx'))).toBe(true)
  })

  it('is a client component', () => {
    const src = readFileSync(join(SRC, 'components/auth/UserMenu.tsx'), 'utf-8')
    expect(src).toContain("'use client'")
  })

  it('exports UserMenu function', () => {
    const src = readFileSync(join(SRC, 'components/auth/UserMenu.tsx'), 'utf-8')
    expect(src).toContain('export function UserMenu')
  })

  it('has aria-label for user menu button', () => {
    const src = readFileSync(join(SRC, 'components/auth/UserMenu.tsx'), 'utf-8')
    expect(src).toContain('aria-label="User menu"')
  })

  it('invokes signOut server action', () => {
    const src = readFileSync(join(SRC, 'components/auth/UserMenu.tsx'), 'utf-8')
    expect(src).toContain('signOut')
  })

  it('has click-outside handling via useRef + useEffect', () => {
    const src = readFileSync(join(SRC, 'components/auth/UserMenu.tsx'), 'utf-8')
    expect(src).toContain('useRef')
    expect(src).toContain('useEffect')
  })

  it('has keyboard Escape handler', () => {
    const src = readFileSync(join(SRC, 'components/auth/UserMenu.tsx'), 'utf-8')
    expect(src).toContain('Escape')
  })

  it('dashboard layout wires UserMenu', () => {
    const src = readFileSync(join(SRC, 'app/(dashboard)/layout.tsx'), 'utf-8')
    expect(src).toContain('UserMenu')
  })

  it('admin layout wires UserMenu', () => {
    const src = readFileSync(join(SRC, 'app/(admin)/layout.tsx'), 'utf-8')
    expect(src).toContain('UserMenu')
  })
})
