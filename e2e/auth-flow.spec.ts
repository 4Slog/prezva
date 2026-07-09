import { test, expect } from '@playwright/test'
import { ADMIN_EMAIL, ADMIN_PASSWORD } from './constants'

// Tests run against the production URL (prezva.app).
// Run with: E2E_BASE_URL=https://prezva.app npx playwright test e2e/auth-flow.spec.ts

test.describe('Auth flow — sign in and sign out', () => {
  test('login page renders with email/password fields + Google OAuth button', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('input[name="email"]')).toBeVisible()
    await expect(page.locator('input[name="password"]')).toBeVisible()
    const googleBtn = page.locator('button, a').filter({ hasText: /google/i })
    await expect(googleBtn).toBeVisible()
    await expect(page.locator('a[href="/"]').first()).toBeVisible()
  })

  test('signup page renders with dark theme + Google OAuth button', async ({ page }) => {
    await page.goto('/signup')
    await expect(page.locator('input[name="email"]')).toBeVisible()
    await expect(page.locator('input[name="password"]')).toBeVisible()
    const googleBtn = page.locator('button, a').filter({ hasText: /google/i })
    await expect(googleBtn).toBeVisible()
    await expect(page.locator('a[href="/"]').first()).toBeVisible()
  })

  test('admin can sign in and reach the organizer dashboard', async ({ page }) => {
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
      test.skip(true, 'E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD not set')
    }
    await page.goto('/login')
    await page.fill('input[name="email"]', ADMIN_EMAIL)
    await page.fill('input[name="password"]', ADMIN_PASSWORD)
    await page.click('button[type="submit"]')
    // Login redirects to /me (profile page), not directly to /dashboard
    await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 15000 })
    await page.goto('/dashboard')
    await expect(page.locator('h1')).toContainText('Organizer Dashboard')
  })

  test('admin can open user menu and sign out', async ({ page }) => {
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
      test.skip(true, 'E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD not set')
    }
    await page.goto('/login')
    await page.fill('input[name="email"]', ADMIN_EMAIL)
    await page.fill('input[name="password"]', ADMIN_PASSWORD)
    await page.click('button[type="submit"]')
    // Login redirects to /me (profile page), not directly to /dashboard
    await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 15000 })

    const userMenu = page.locator('[aria-label="User menu"]')
    await expect(userMenu).toBeVisible({ timeout: 10000 })
    await userMenu.click()
    const menu = page.locator('[role="menu"]')
    await expect(menu).toBeVisible()
    await expect(menu).toContainText(ADMIN_EMAIL)
    await expect(menu.locator('text=Security & 2FA')).toBeVisible()

    await menu.locator('button').filter({ hasText: 'Sign out' }).click()
    await page.waitForURL(/\/login/, { timeout: 10000 })
  })

  test('login with wrong password stays on login with no 500', async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[name="email"]', 'notreal@prezva.app')
    await page.fill('input[name="password"]', 'wrongpassword')
    await page.click('button[type="submit"]')
    // Must stay on login — no redirect to dashboard
    await expect(page).toHaveURL(/\/login/, { timeout: 8000 })
    const body = await page.locator('body').textContent()
    expect(body).not.toContain('Internal Server Error')
  })
})
