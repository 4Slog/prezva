import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const isConfigured = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)

const redis = isConfigured
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null

// 10 registrations per IP per minute
export const registrationLimiter = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, '1 m'), prefix: 'rl:reg' })
  : null

// 60 check-ins per IP per minute (organizer tools get more headroom)
export const checkinLimiter = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(60, '1 m'), prefix: 'rl:checkin' })
  : null

// 5 QR lookups per IP per minute (prevents email enumeration)
export const myQrLimiter = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, '1 m'), prefix: 'rl:qr' })
  : null

export async function checkRateLimit(
  limiter: Ratelimit | null,
  identifier: string
): Promise<{ limited: boolean; remaining: number }> {
  if (!limiter) return { limited: false, remaining: 999 }
  const { success, remaining } = await limiter.limit(identifier)
  return { limited: !success, remaining }
}
