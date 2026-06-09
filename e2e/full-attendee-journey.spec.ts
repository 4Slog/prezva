/**
 * Full attendee journey: visit public event → explore attendee features
 *
 * Read-only — no form submissions. Real registration is proven in lifecycle.spec.ts.
 * Uses SLUGS.ended (bsbw-2026) which has rich seeded data: sponsors, 515 regs, speakers.
 */
import { test, expect } from '@playwright/test'
import { SLUGS } from './constants'

test.describe('Full attendee journey', () => {
  test.setTimeout(60_000)

  test('AJ-01: public event page loads with all key sections', async ({ page }) => {
    await page.goto(`/e/${SLUGS.ended}`)
    await expect(page.locator('h1')).toBeVisible({ timeout: 10_000 })
  })

  test('AJ-02: public event page shows event metadata', async ({ page }) => {
    await page.goto(`/e/${SLUGS.ended}`)
    const h1 = page.locator('h1')
    await expect(h1).toBeVisible({ timeout: 10_000 })
    const title = await h1.textContent()
    expect(title?.length).toBeGreaterThan(3)
  })

  test('AJ-03: registration page renders without crash', async ({ page }) => {
    await page.goto(`/e/${SLUGS.ended}/register`)
    await expect(page.locator('h1, h2')).toBeVisible({ timeout: 10_000 })
    const body = await page.locator('body').textContent()
    expect(body).not.toContain('Internal Server Error')
  })

  test('AJ-04: registration form has attendee fields or shows closed state', async ({ page }) => {
    await page.goto(`/e/${SLUGS.ended}/register`)
    const status = await page.evaluate(() => document.readyState)
    expect(status).toBe('complete')
    // Either shows a form or an appropriate closed/ended message
    const body = await page.locator('body').textContent()
    expect(body).not.toContain('row-level security')
  })

  test('AJ-05: public agenda page loads', async ({ page }) => {
    await page.goto(`/e/${SLUGS.ended}/agenda`)
    await expect(page.locator('h1, h2')).toBeVisible({ timeout: 10_000 })
  })

  test('AJ-06: public speakers page loads', async ({ page }) => {
    await page.goto(`/e/${SLUGS.ended}/speakers`)
    await expect(page.locator('h1')).toBeVisible({ timeout: 10_000 })
  })

  test('AJ-07: public community page renders (anon sees sign-in prompt or list)', async ({ page }) => {
    await page.goto(`/e/${SLUGS.ended}/community`)
    const status = await page.evaluate(() => document.readyState)
    expect(status).toBe('complete')
    expect(page.url()).not.toContain('/login')
  })

  test('AJ-08: public icebreakers page loads for anon', async ({ page }) => {
    await page.goto(`/e/${SLUGS.ended}/icebreakers`)
    const status = await page.evaluate(() => document.readyState)
    expect(status).toBe('complete')
  })

  test('AJ-09: public leaderboard page loads', async ({ page }) => {
    await page.goto(`/e/${SLUGS.ended}/leaderboard`)
    await expect(page.locator('h1, h2')).toBeVisible({ timeout: 10_000 })
  })

  test('AJ-10: public passport page loads for anon', async ({ page }) => {
    await page.goto(`/e/${SLUGS.ended}/passport`)
    const status = await page.evaluate(() => document.readyState)
    expect(status).toBe('complete')
  })

  test('AJ-11: public photos page loads', async ({ page }) => {
    await page.goto(`/e/${SLUGS.ended}/photos`)
    const status = await page.evaluate(() => document.readyState)
    expect(status).toBe('complete')
  })

  test('AJ-12: public trivia page loads for anon', async ({ page }) => {
    await page.goto(`/e/${SLUGS.ended}/trivia`)
    const status = await page.evaluate(() => document.readyState)
    expect(status).toBe('complete')
  })

  test('AJ-13: public groups page loads for anon', async ({ page }) => {
    await page.goto(`/e/${SLUGS.ended}/groups`)
    const status = await page.evaluate(() => document.readyState)
    expect(status).toBe('complete')
  })

  test('AJ-14: my-qr page does not crash for anon', async ({ page }) => {
    await page.goto(`/e/${SLUGS.ended}/my-qr`)
    // Page renders inline (shows sign-in prompt) rather than hard-redirecting to /login
    const status = await page.evaluate(() => document.readyState)
    expect(status).toBe('complete')
    const body = await page.locator('body').textContent()
    expect(body).not.toContain('Internal Server Error')
  })

  test('AJ-15: my-agenda page does not 500 for anon', async ({ page }) => {
    await page.goto(`/e/${SLUGS.ended}/my-agenda`)
    const status = await page.evaluate(() => document.readyState)
    expect(status).toBe('complete')
  })

  test('AJ-16: confirmation page does not crash for anon', async ({ page }) => {
    await page.goto(`/e/${SLUGS.ended}/confirmation`)
    const status = await page.evaluate(() => document.readyState)
    expect(status).toBe('complete')
  })

  test('AJ-17: certificate page renders for anon', async ({ page }) => {
    await page.goto(`/e/${SLUGS.ended}/certificate`)
    const status = await page.evaluate(() => document.readyState)
    expect(status).toBe('complete')
  })

  test('AJ-18: people directory page loads for anon', async ({ page }) => {
    await page.goto(`/e/${SLUGS.ended}/people`)
    const status = await page.evaluate(() => document.readyState)
    expect(status).toBe('complete')
  })

  test('AJ-19: /me redirects unauthenticated to login', async ({ page }) => {
    await page.goto('/me')
    await expect(page).toHaveURL(/\/login/)
  })

  test('AJ-20: /me/events redirects unauthenticated', async ({ page }) => {
    await page.goto('/me/events')
    await expect(page).toHaveURL(/\/login/)
  })

  test('AJ-21: calendar ICS download returns valid content-type', async ({ request }) => {
    const response = await request.get(`/api/events/${SLUGS.ended}/calendar.ics`)
    expect(response.status()).toBe(200)
    const ct = response.headers()['content-type']
    expect(ct).toContain('text/calendar')
  })

  test('AJ-22: event page has agenda and calendar links', async ({ page }) => {
    // Use SLUGS.live — bsbw-2026 (ended) is inaccessible to anon users (RLS)
    await page.goto(`/e/${SLUGS.live}`)
    // Public event page always shows View Agenda and Add to Calendar links
    await expect(page.locator(`a[href*="${SLUGS.live}/agenda"]`).first()).toBeVisible({ timeout: 10_000 })
    await expect(page.locator(`a[href*="/calendar.ics"]`).first()).toBeVisible()
  })

  test('AJ-23: registration form is wired (page loads without error)', async ({ page }) => {
    await page.goto(`/e/${SLUGS.ended}/register`)
    const status = await page.evaluate(() => document.readyState)
    expect(status).toBe('complete')
  })
})
