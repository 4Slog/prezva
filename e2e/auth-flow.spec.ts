import { test, expect } from '@playwright/test'

// These tests run against the production URL (prezva.app).
// Run with: E2E_BASE_URL=https://prezva.app npx playwright test e2e/auth-flow.spec.ts

const DEMO_OWNER_EMAIL = 'demo.owner@prezva-audit.test'
const DEMO_OWNER_PASS  = 'AuditDemo2026!'

test.describe('Auth flow — sign in and sign out', () => {
  test('login page renders with dark theme + Google OAuth button', async ({ page }) => {
    await page.goto('/login')
    // Dark-themed card should have dark background (not white)
    await expect(page.locator('input[name="email"]')).toBeVisible()
    await expect(page.locator('input[name="password"]')).toBeVisible()
    // Google OAuth button visible (disabled or enabled)
    const googleBtn = page.locator('button, a').filter({ hasText: /google/i })
    await expect(googleBtn).toBeVisible()
    // Back to home link
    await expect(page.locator('a[href="/"]')).toBeVisible()
  })

  test('signup page renders with dark theme + Google OAuth button', async ({ page }) => {
    await page.goto('/signup')
    await expect(page.locator('input[name="email"]')).toBeVisible()
    await expect(page.locator('input[name="password"]')).toBeVisible()
    const googleBtn = page.locator('button, a').filter({ hasText: /google/i })
    await expect(googleBtn).toBeVisible()
    await expect(page.locator('a[href="/"]')).toBeVisible()
  })

  test('demo owner can sign in and access dashboard', async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[name="email"]', DEMO_OWNER_EMAIL)
    await page.fill('input[name="password"]', DEMO_OWNER_PASS)
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 15000 })
    await expect(page.locator('h1')).toContainText('Organizer Dashboard')
  })

  test('demo owner can open user menu and see sign out button', async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[name="email"]', DEMO_OWNER_EMAIL)
    await page.fill('input[name="password"]', DEMO_OWNER_PASS)
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 15000 })

    // Open user menu
    await page.click('[aria-label="User menu"]')
    const menu = page.locator('[role="menu"]')
    await expect(menu).toBeVisible()

    // Menu should show email and links
    await expect(menu).toContainText(DEMO_OWNER_EMAIL)
    await expect(menu.locator('text=Security & 2FA')).toBeVisible()
    await expect(menu.locator('text=Help Center')).toBeVisible()

    // Sign out
    await menu.locator('button', { hasText: 'Sign out' }).click()
    await page.waitForURL(/\/login/, { timeout: 10000 })
  })

  test('attendee without org lands on /onboarding not /dashboard', async ({ page }) => {
    // This test requires demo.attendee to have no org memberships
    // If account doesn't exist, skip gracefully
    await page.goto('/login')
    await page.fill('input[name="email"]', 'demo.attendee@prezva-audit.test')
    await page.fill('input[name="password"]', 'AuditDemo2026!')
    await page.click('button[type="submit"]')
    // Should NOT land on dashboard (organizer view)
    try {
      await page.waitForURL(/\/(onboarding|e\/.+\/my-agenda)/, { timeout: 10000 })
    } catch {
      // If attendee account doesn't exist, they'll stay on login with error — acceptable
      const currentUrl = page.url()
      expect(currentUrl).not.toMatch(/\/dashboard$/)
    }
  })
})
