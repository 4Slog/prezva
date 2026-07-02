import { z } from 'zod'

export function normalizeHandle(input: string): string {
  let slug = input.toLowerCase()
  slug = slug.replace(/[^a-z0-9]+/g, '_')
  slug = slug.replace(/_+/g, '_')
  slug = slug.replace(/^_+|_+$/g, '')
  return slug
}

export const HandleSchema = z
  .string()
  .regex(/^[a-z0-9_]{3,30}$/, 'Handles are 3–30 lowercase letters, numbers, or underscores')
