import { test, expect, type Page } from '@playwright/test'
import { SLUGS, ADMIN_EMAIL, ADMIN_PASSWORD } from './constants'

async function loginAsAdmin(page: Page) {
  await page.goto('/login')
  await page.fill('input[name="email"]', ADMIN_EMAIL)
  await page.fill('input[name="password"]', ADMIN_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 15_000 })
}

test.describe('Authenticated access', () => {
  test.beforeEach(async ({}) => {
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
      test.skip(true, 'E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD not set')
    }
  })

  test('AA-01: admin logs in and reaches an authenticated home', async ({ page }) => {
    await loginAsAdmin(page)
    expect(page.url()).not.toContain('/login')
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10_000 })
  })

  test('AA-02: admin can open the tickets page and is NOT redirected', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`/events/${SLUGS.live}/tickets`)
    // Must not bounce back to /login or the event overview
    await expect(page).not.toHaveURL(/\/login/)
    await expect(page).toHaveURL(/\/tickets$/)
    await expect(page.locator('h1')).toContainText('Tickets', { timeout: 10_000 })
  })

  test('AA-03: admin can sign out via user menu', async ({ page }) => {
    await loginAsAdmin(page)
    await page.waitForLoadState('domcontentloaded')
    // Wait for page to fully hydrate before clicking user menu
    const userMenu = page.locator('[aria-label="User menu"]')
    await expect(userMenu).toBeVisible({ timeout: 10_000 })
    await userMenu.click()
    const menu = page.locator('[role="menu"]')
    await expect(menu).toBeVisible()
    await menu.locator('button').filter({ hasText: 'Sign out' }).click()
    await page.waitForURL(/\/login/, { timeout: 10_000 })
  })
})
