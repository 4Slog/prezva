import { PERMISSION_LABELS, PERMISSION_FALLBACK } from './permission-labels'

export class PermissionError extends Error {
  override name = 'PermissionError'
  permissionKey: string
  digest: string

  constructor(permissionKey: string) {
    const label = PERMISSION_LABELS[permissionKey] ?? PERMISSION_FALLBACK
    super(`You don't have permission to ${label}.`)
    this.name = 'PermissionError'
    this.permissionKey = permissionKey
    this.digest = 'PERMISSION_DENIED'
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export class OrgAccessError extends PermissionError {
  constructor() {
    super('')
    this.message = "You don't have access to this organization."
  }
}

export function isPermissionError(e: unknown): boolean {
  return (
    e instanceof PermissionError ||
    (typeof e === 'object' &&
      e !== null &&
      typeof (e as Record<string, unknown>).digest === 'string' &&
      ((e as Record<string, unknown>).digest as string).startsWith('PERMISSION_DENIED'))
  )
}

// Shared helper for Layer A actions that return { error: string }.
// Converts a PermissionError into { error: e.message }; rethrows anything else.
export function catchPermission(e: unknown): { error: string } {
  if (isPermissionError(e)) return { error: (e as Error).message }
  throw e
}
