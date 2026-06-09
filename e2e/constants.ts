export const SLUGS = {
  live: 'saup-ce-conference-2026',
  published: 'oss-atl-virtual-summit-2026',
  ended: 'bsbw-2026',
} as const

export const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'sowu.paul+saup.admin@gmail.com'
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'SeedPass123!'
