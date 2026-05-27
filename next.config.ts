import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: '*.supabase.in' },
    ],
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
    ]
  },
}

export default nextConfig
