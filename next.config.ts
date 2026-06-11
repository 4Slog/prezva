import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: '*.supabase.in' },
    ],
  },
  async rewrites() {
    return [
      // Public-facing calendar ICS URL used in confirmation emails.
      // Next.js does not register directories with dots as App Router routes,
      // so we rewrite /e/:slug/calendar.ics → the existing API route handler.
      {
        source: '/e/:slug/calendar.ics',
        destination: '/api/events/:slug/calendar.ics',
      },
    ]
  },
  async headers() {
    // Order matters: Next.js applies all matching entries in order, and a
    // later entry wins per-header-key. The restrictive baseline goes first
    // so the check-in overrides below replace it on those routes.
    const checkinPermissions = {
      key: 'Permissions-Policy',
      value: 'camera=(self), microphone=(), geolocation=()',
    }
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      { source: '/e/:slug/checkin',       headers: [checkinPermissions] },
      { source: '/checkin/:path*',        headers: [checkinPermissions] },
      { source: '/events/:slug/check-in', headers: [checkinPermissions] },
      { source: '/events/:slug/checkin',  headers: [checkinPermissions] },
      { source: '/events/:slug/sessions/:sessionId/checkin', headers: [checkinPermissions] },
      {
        source: '/embedded/events/:eventId/checkin',
        headers: [
          {
            key: 'Permissions-Policy',
            // camera=(self) alone is not enough inside a cross-origin iframe —
            // must explicitly name the embedding origin to delegate the permission.
            value: 'camera=(self "https://app.gohighlevel.com"), microphone=(), geolocation=()',
          },
        ],
      },
      {
        source: '/embedded/events/:eventId/sessions/:sessionId/checkin',
        headers: [
          {
            key: 'Permissions-Policy',
            value: 'camera=(self "https://app.gohighlevel.com"), microphone=(), geolocation=()',
          },
        ],
      },
    ]
  },
}

export default nextConfig
