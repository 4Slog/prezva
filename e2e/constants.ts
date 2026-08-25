// INVARIANT: `published` MUST point at an event whose end_at is in the FUTURE.
// The public event page hides the register CTA once end_at has passed
// (src/app/e/[slug]/page.tsx — isPostEvent), so a past event silently fails
// anon-registration.spec.ts. The previous value (oss-atl-virtual-summit-2026)
// ended 2026-08-22 and reddened CI for two days before anyone noticed.
// prezva-e2e-evergreen is dated 2030 deliberately. Do not "tidy" it to a nearer date.
export const SLUGS = {
  live: 'saup-ce-conference-2026',
  published: 'prezva-e2e-evergreen',
  ended: 'bsbw-2026',
} as const

// Credentials must come from env — no fallback defaults to avoid leaking real creds in git.
// Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD in .env.test (gitignored) or CI secrets.
export const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? ''
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? ''
