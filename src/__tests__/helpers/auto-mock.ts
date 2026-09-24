import { vi } from 'vitest'

// A module stand-in whose every named export is a vi.fn() created on first
// access — for heavy modules (trigger, GHL, stripe) a test never exercises.
export function autoMockModule(overrides: Record<string, unknown> = {}) {
  const target: Record<string | symbol, unknown> = { ...overrides }
  return new Proxy(target, {
    get(t, prop) {
      if (prop === 'then' || prop === '__esModule' || typeof prop === 'symbol') return t[prop]
      if (!(prop in t)) t[prop] = vi.fn().mockResolvedValue(null)
      return t[prop]
    },
    has: () => true,
  })
}
