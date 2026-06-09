export const SLUGS = {
  live: 'saup-ce-conference-2026',
  published: 'oss-atl-virtual-summit-2026',
  ended: 'bsbw-2026',
} as const

// Credentials must come from env — no fallback defaults to avoid leaking real creds in git.
// Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD in .env.test (gitignored) or CI secrets.
export const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? ''
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? ''
