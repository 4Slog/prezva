import { createHmac, timingSafeEqual } from 'crypto'

export function verifyZoomSignature(rawBody: string, timestamp: string, signature: string, secret: string): boolean {
  const message = `v0:${timestamp}:${rawBody}`
  const expected = 'v0=' + createHmac('sha256', secret).update(message).digest('hex')
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false
  }
}

export function verifyHmacSha256(payload: string, signature: string, secret: string, prefix = ''): boolean {
  const expected = prefix + createHmac('sha256', secret).update(payload).digest('hex')
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false
  }
}
