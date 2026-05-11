import type { NextConfig } from 'next'
// @ts-expect-error next-pwa has no types package
import withPWA from 'next-pwa'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: '*.supabase.in' },
    ],
  },
  async headers() {
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
    ]
  },
}

export default withPWA({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  runtimeCaching: [
    {
      urlPattern: /^https?.*\/agenda/,
      handler: 'StaleWhileRevalidate',
      options: { cacheName: 'agenda-cache', expiration: { maxEntries: 50, maxAgeSeconds: 3600 } },
    },
    {
      urlPattern: /^https?.*\/api\/events\/.*\/checkin/,
      handler: 'NetworkFirst',
      options: { cacheName: 'checkin-api', networkTimeoutSeconds: 5 },
    },
    {
      urlPattern: /^https?.*\.(png|jpg|svg|ico)$/,
      handler: 'CacheFirst',
      options: { cacheName: 'static-images', expiration: { maxEntries: 100, maxAgeSeconds: 86400 } },
    },
  ],
})(nextConfig)
