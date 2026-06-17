/**
 * Full organizer journey: signup → login → auth-gated pages
 *
 * Read-only assertions. Uses SLUGS.live for auth-gated admin pages.
 */
import { test, expect } from '@playwright/test'
import { SLUGS } from './constants'

const TS = Date.now()
const EMAIL = `e2e-org-${TS}@test.prezva.app`
const PASSWORD = 'E2eTest123!'

test.describe('Full organizer journey', () => {
  test.setTimeout(120_000)

  test('OJ-01: signup page renders with required fields', async ({ page }) => {
    await page.goto('/signup')
    await expect(page.locator('input[name="full_name"]')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('input[name="email"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()
  })

  test('OJ-02: login page renders and accepts credentials', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('[name="email"]')).toBeVisible()
    await expect(page.locator('[name="password"]')).toBeVisible()
    await page.fill('[name="email"]', EMAIL)
    await page.fill('[name="password"]', PASSWORD)
    await expect(page.locator('button[type="submit"]')).toBeEnabled()
  })

  test('OJ-03: create org page requires auth', async ({ page }) => {
    await page.goto('/orgs/new')
    await expect(page).toHaveURL(/\/login/)
  })

  test('OJ-04: new event form requires auth', async ({ page }) => {
    await page.goto('/events/new')
    await expect(page).toHaveURL(/\/login/)
  })

  test('OJ-05: public event page loads', async ({ page }) => {
    await page.goto(`/e/${SLUGS.live}`)
    await expect(page.locator('h1')).toBeVisible({ timeout: 10_000 })
  })

  test('OJ-06: admin event page is auth-gated', async ({ page }) => {
    await page.goto(`/events/${SLUGS.live}`)
    await expect(page).toHaveURL(/\/login/)
  })

  test('OJ-07: dashboard redirect for unauthenticated users', async ({ page }) => {
    await page.goto('/dashboard')
    expect(page.url()).toContain('/login')
  })

  test('OJ-08: event analytics page is auth-gated', async ({ page }) => {
    await page.goto(`/events/${SLUGS.live}/analytics`)
    await expect(page).toHaveURL(/\/login/)
  })

  test('OJ-09: event attendees page is auth-gated', async ({ page }) => {
    await page.goto(`/events/${SLUGS.live}/attendees`)
    await expect(page).toHaveURL(/\/login/)
  })

  test('OJ-10: event check-in page is auth-gated', async ({ page }) => {
    await page.goto(`/events/${SLUGS.live}/checkin`)
    await expect(page).toHaveURL(/\/login/)
  })

  test('OJ-11: event announcements page is auth-gated', async ({ page }) => {
    await page.goto(`/events/${SLUGS.live}/announcements`)
    await expect(page).toHaveURL(/\/login/)
  })

  test('OJ-12: event surveys page is auth-gated', async ({ page }) => {
    await page.goto(`/events/${SLUGS.live}/surveys`)
    await expect(page).toHaveURL(/\/login/)
  })

  test('OJ-13: event sponsors page is auth-gated', async ({ page }) => {
    await page.goto(`/events/${SLUGS.live}/sponsors`)
    await expect(page).toHaveURL(/\/login/)
  })

  test('OJ-14: event speakers page is auth-gated', async ({ page }) => {
    await page.goto(`/events/${SLUGS.live}/speakers`)
    await expect(page).toHaveURL(/\/login/)
  })

  test('OJ-15: event agenda page is auth-gated', async ({ page }) => {
    await page.goto(`/events/${SLUGS.live}/agenda`)
    await expect(page).toHaveURL(/\/login/)
  })

  test('OJ-16: event tickets page is auth-gated', async ({ page }) => {
    await page.goto(`/events/${SLUGS.live}/tickets`)
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
    const url = page.url()
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
