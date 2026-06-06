import { describe, it, expect } from 'vitest'
import { PermissionError, OrgAccessError, isPermissionError, catchPermission } from './permission-error'

describe('PermissionError', () => {
  it('carries a friendly message for a known key', () => {
    const e = new PermissionError('announcements.send')
    expect(e.message).toBe("You don't have permission to send announcements.")
    expect(e.permissionKey).toBe('announcements.send')
    expect(e.digest).toBe('PERMISSION_DENIED')
    expect(e.name).toBe('PermissionError')
  })

  it('uses fallback message for an unknown key', () => {
    const e = new PermissionError('not.a.real.key')
    expect(e.message).toBe("You don't have permission to perform this action.")
    expect(e.permissionKey).toBe('not.a.real.key')
  })

  it('is instanceof Error and PermissionError', () => {
    const e = new PermissionError('event.manage')
    expect(e instanceof Error).toBe(true)
    expect(e instanceof PermissionError).toBe(true)
  })
})

describe('OrgAccessError', () => {
  it('carries the org-access message', () => {
    const e = new OrgAccessError()
    expect(e.message).toBe("You don't have access to this organization.")
    expect(e.digest).toBe('PERMISSION_DENIED')
    expect(e.name).toBe('PermissionError')
  })

  it('is instanceof PermissionError', () => {
    const e = new OrgAccessError()
    expect(e instanceof PermissionError).toBe(true)
  })
})

describe('isPermissionError', () => {
  it('returns true for PermissionError instance', () => {
    expect(isPermissionError(new PermissionError('attendees.view'))).toBe(true)
  })

  it('returns true for OrgAccessError instance', () => {
    expect(isPermissionError(new OrgAccessError())).toBe(true)
  })

  it('returns true for plain object with digest=PERMISSION_DENIED (client boundary shape)', () => {
    expect(isPermissionError({ digest: 'PERMISSION_DENIED', message: '' })).toBe(true)
  })

  it('returns true for digest with suffix (future-proofing)', () => {
    expect(isPermissionError({ digest: 'PERMISSION_DENIED_ORG', message: '' })).toBe(true)
  })

  it('returns false for a generic Error', () => {
    expect(isPermissionError(new Error('oops'))).toBe(false)
  })

  it('returns false for null', () => {
    expect(isPermissionError(null)).toBe(false)
  })

  it('returns false for wrong digest value', () => {
    expect(isPermissionError({ digest: 'SOMETHING_ELSE' })).toBe(false)
  })
})

describe('catchPermission', () => {
  it('returns { error } for a PermissionError', () => {
    const e = new PermissionError('attendees.refund')
    expect(catchPermission(e)).toEqual({ error: "You don't have permission to issue refunds." })
  })

  it('rethrows non-permission errors', () => {
    const e = new Error('db failure')
    expect(() => catchPermission(e)).toThrow('db failure')
  })

  it('rethrows strings (non-Error throws)', () => {
    expect(() => catchPermission('something broke')).toThrow()
  })
})
