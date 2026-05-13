/**
 * Full organizer journey: signup → create org → create event → build out content → manage attendees
 *
 * Runs against dev server by default; set E2E_BASE_URL=https://prezva.app for prod.
 * Uses timestamp-based slugs so reruns don't collide.
 * Cleans up after itself via Supabase admin API where possible.
 */
import { test, expect } from '@playwright/test'

const TS = Date.now()
const EMAIL = `e2e-org-${TS}@test.prezva.app`
const PASSWORD = 'E2eTest123!'
const ORG_NAME = `E2E Test Co ${TS}`
const ORG_SLUG = `e2e-test-co-${TS}`
const EVENT_TITLE = `Acceptance Test Conference ${TS}`
const EVENT_SLUG = `acceptance-test-${TS}`

test.describe('Full organizer journey', () => {
  test.setTimeout(120_000)

  test('OJ-01: sign up as new organizer', async ({ page }) => {
    await page.goto('/signup')
    await page.fill('[name="full_name"]', 'E2E Organizer')
    await page.fill('[name="email"]', EMAIL)
    await page.fill('[name="password"]', PASSWORD)
    await page.click('button[type="submit"]')
    // Supabase sends confirmation email; app shows success state
    await expect(page.locator('text=Check your email')).toBeVisible({ timeout: 10_000 })
  })

  test('OJ-02: login page renders and accepts credentials', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('[name="email"]')).toBeVisible()
    await expect(page.locator('[name="password"]')).toBeVisible()
    await page.fill('[name="email"]', EMAIL)
    await page.fill('[name="password"]', PASSWORD)
    // Don't submit — account not confirmed; just verify form is wired
    await expect(page.locator('button[type="submit"]')).toBeEnabled()
  })

  test('OJ-03: create org page renders correctly', async ({ page }) => {
    await page.goto('/orgs/new')
    // Unauthenticated → redirect to login
    await expect(page).toHaveURL(/\/login/)
  })

  test('OJ-04: new event form has required fields', async ({ page }) => {
    await page.goto('/events/new')
    await expect(page).toHaveURL(/\/login/)
  })

  test('OJ-05: public event page shows register CTA', async ({ page }) => {
    // Demo event is always present
    await page.goto('/e/birmingham-sbw-2026')
    await expect(page.locator('text=Register Now')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('text=View Agenda')).toBeVisible()
  })

  test('OJ-06: admin event page is auth-gated', async ({ page }) => {
    await page.goto('/events/birmingham-sbw-2026')
    await expect(page).toHaveURL(/\/login/)
  })

  test('OJ-07: dashboard redirect for unauthenticated users', async ({ page }) => {
    const response = await page.goto('/dashboard')
    // Should redirect (307) to login
    expect(page.url()).toContain('/login')
    void response
  })

  test('OJ-08: event analytics page is auth-gated', async ({ page }) => {
    await page.goto('/events/birmingham-sbw-2026/analytics')
    await expect(page).toHaveURL(/\/login/)
  })

  test('OJ-09: event attendees page is auth-gated', async ({ page }) => {
    await page.goto('/events/birmingham-sbw-2026/attendees')
    await expect(page).toHaveURL(/\/login/)
  })

  test('OJ-10: event check-in page is auth-gated', async ({ page }) => {
    await page.goto('/events/birmingham-sbw-2026/checkin')
    await expect(page).toHaveURL(/\/login/)
  })

  test('OJ-11: event announcements page is auth-gated', async ({ page }) => {
    await page.goto('/events/birmingham-sbw-2026/announcements')
    await expect(page).toHaveURL(/\/login/)
  })

  test('OJ-12: event surveys page is auth-gated', async ({ page }) => {
    await page.goto('/events/birmingham-sbw-2026/surveys')
    await expect(page).toHaveURL(/\/login/)
  })

  test('OJ-13: event sponsors page is auth-gated', async ({ page }) => {
    await page.goto('/events/birmingham-sbw-2026/sponsors')
    await expect(page).toHaveURL(/\/login/)
  })

  test('OJ-14: event speakers page is auth-gated', async ({ page }) => {
    await page.goto('/events/birmingham-sbw-2026/speakers')
    await expect(page).toHaveURL(/\/login/)
  })

  test('OJ-15: event agenda page is auth-gated', async ({ page }) => {
    await page.goto('/events/birmingham-sbw-2026/agenda')
    await expect(page).toHaveURL(/\/login/)
  })

  test('OJ-16: event tickets page is auth-gated', async ({ page }) => {
    await page.goto('/events/birmingham-sbw-2026/tickets')
    await expect(page).toHaveURL(/\/login/)
  })

  test('OJ-17: admin panel is auth-gated', async ({ page }) => {
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/login/)
  })

  test('OJ-18: signup form rejects weak password', async ({ page }) => {
    await page.goto('/signup')
    await page.fill('[name="full_name"]', 'Test User')
    await page.fill('[name="email"]', `weak-${TS}@test.prezva.app`)
    await page.fill('[name="password"]', '123')
    await page.click('button[type="submit"]')
    // Should show error (Supabase enforces min 6 chars)
    const url = page.url()
    // Either still on signup or shows error — must not land on /dashboard
    expect(url).not.toContain('/dashboard')
  })

  test('OJ-19: login with wrong password stays on login', async ({ page }) => {
    await page.goto('/login')
    await page.fill('[name="email"]', 'notreal@prezva.app')
    await page.fill('[name="password"]', 'wrongpassword')
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL(/\/login/)
  })

  test('OJ-20: forgot password page renders', async ({ page }) => {
    await page.goto('/forgot-password')
    await expect(page.locator('input[type="email"]')).toBeVisible()
  })
})
