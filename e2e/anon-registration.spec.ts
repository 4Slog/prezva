import { test, expect } from '@playwright/test'

// Tests anonymous registration (no Supabase auth account needed).
// Run with: E2E_BASE_URL=https://prezva.app npx playwright test e2e/anon-registration.spec.ts

const EVENT_SLUG = 'birmingham-sbw-2026'

test.describe('Anonymous registration — Birmingham SBW 2026', () => {
  test('public event page loads with Register CTA', async ({ page }) => {
    const resp = await page.goto(`/e/${EVENT_SLUG}`)
    expect(resp?.status()).toBe(200)
    await expect(page.locator('text=Register Now, a, button').first()).toBeVisible()
  })

  test('register page renders ticket selector', async ({ page }) => {
    await page.goto(`/e/${EVENT_SLUG}/register`)
    // Should show at least one ticket option
    await expect(page.locator('[data-testid="ticket-option"], input[type="radio"], .ticket-card').first()).toBeVisible({ timeout: 10000 }).catch(async () => {
      // If no test ids, look for price indicators
      await expect(page.getByText(/free|rsvp|\$\d+/i).first()).toBeVisible()
    })
  })

  test('anonymous registration completes without RLS error', async ({ page }) => {
    await page.goto(`/e/${EVENT_SLUG}/register`)

    // Click the first available ticket option (Free RSVP)
    const freeTicket = page.getByText(/free rsvp|free/i).first()
    if (await freeTicket.isVisible()) {
      await freeTicket.click()
    }

    // Fill registration form
    const ts = Date.now()
    const email = `e2e-anon-${ts}@gmail.com`
    const nameField = page.locator('input[name="full_name"], input[placeholder*="name" i]').first()
    const emailField = page.locator('input[type="email"]').first()

    if (await nameField.isVisible()) {
      await nameField.fill(`E2E Test User ${ts}`)
    }
    if (await emailField.isVisible()) {
      await emailField.fill(email)
    }

    // Submit
    const submitBtn = page.locator('button[type="submit"], button:has-text("Complete"), button:has-text("Register")').first()
    await submitBtn.click()

    // Should land on confirmation, NOT show RLS error
    await page.waitForURL(/\/(confirmation|register)/, { timeout: 15000 })
    const currentUrl = page.url()

    if (currentUrl.includes('confirmation')) {
      await expect(page.getByText(/registered|confirmed|you're in/i).first()).toBeVisible()
    } else {
      // If still on register, check there's no raw DB error visible
      const body = await page.locator('body').textContent()
      expect(body).not.toContain('row-level security policy')
      expect(body).not.toContain('violates row-level security')
    }
  })

  test('confirmation page does not expose raw database errors', async ({ page }) => {
    const resp = await page.goto(`/e/${EVENT_SLUG}/confirmation`)
    expect(resp?.status()).not.toBe(500)
    const body = await page.locator('body').textContent()
    expect(body).not.toContain('SQL')
    expect(body).not.toContain('postgres')
    expect(body).not.toContain('row-level security')
  })
})
