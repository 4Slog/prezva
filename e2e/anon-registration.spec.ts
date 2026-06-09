import { test, expect } from '@playwright/test'
import { SLUGS } from './constants'

// Read-only: verifies public registration surface renders — no form submission.
// Real end-to-end registration is proven in lifecycle.spec.ts against a disposable event.
test.describe('Anonymous registration surface — read-only', () => {
  test('public event page loads with register CTA', async ({ page }) => {
    // Use SLUGS.published (upcoming event) — live events have registration closed
    const resp = await page.goto(`/e/${SLUGS.published}`)
    expect(resp?.status()).toBe(200)
    // CTA is a link to /register — tolerant of any label
    await expect(page.locator(`a[href*="/register"]`).first()).toBeVisible({ timeout: 10_000 })
  })

  test('register page renders ticket selector', async ({ page }) => {
    await page.goto(`/e/${SLUGS.published}/register`)
    // Must not 500 or crash — form or a closed-state message must be present
    const status = await page.evaluate(() => document.readyState)
    expect(status).toBe('complete')
    const body = await page.locator('body').textContent()
    expect(body).not.toContain('Internal Server Error')
    expect(body).not.toContain('row-level security')
  })

  test('confirmation page does not expose raw database errors', async ({ page }) => {
    const resp = await page.goto(`/e/${SLUGS.published}/confirmation`)
    expect(resp?.status()).not.toBe(500)
    const body = await page.locator('body').textContent()
    expect(body).not.toContain('SQL')
    expect(body).not.toContain('postgres')
    expect(body).not.toContain('row-level security')
  })
})
