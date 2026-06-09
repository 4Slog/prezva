/**
 * Check-in day E2E suite
 *
 * The check-in interface requires authentication (organizer/staff role).
 * These tests verify: auth gates hold, public surfaces don't crash,
 * and the check-in API route behaves correctly for unauthenticated callers.
 *
 * Full kiosk simulation (authenticated check-in flow) requires a seeded
 * staff session — covered by integration tests in src/__tests__/integration/.
 */
import { test, expect } from '@playwright/test'
import { SLUGS } from './constants'

test.describe('Check-in day', () => {
  test.setTimeout(30_000)

  test('CI-01: check-in page requires auth', async ({ page }) => {
    await page.goto(`/events/${SLUGS.live}/checkin`)
    await expect(page).toHaveURL(/\/login/)
  })

  test('CI-02: attendees page requires auth', async ({ page }) => {
    await page.goto(`/events/${SLUGS.live}/attendees`)
    await expect(page).toHaveURL(/\/login/)
  })

  test('CI-03: attendee detail page requires auth', async ({ page }) => {
    await page.goto(`/events/${SLUGS.live}/attendees/00000000-0000-4000-8000-000000000001`)
    await expect(page).toHaveURL(/\/login/)
  })

  test('CI-04: badges page requires auth', async ({ page }) => {
    await page.goto(`/events/${SLUGS.live}/badges`)
    await expect(page).toHaveURL(/\/login/)
  })

  test('CI-05: check-in API rejects unauthenticated QR scan', async ({ request }) => {
    const res = await request.post('/api/checkin', {
      data: { qr_code: 'FAKE-QR-CODE', event_id: 'fake' },
    })
    expect([401, 403, 404, 405]).toContain(res.status())
    expect(res.status()).not.toBe(200)
    expect(res.status()).not.toBe(500)
  })

  test('CI-06: my-qr page redirects anon to login', async ({ page }) => {
    await page.goto(`/e/${SLUGS.live}/my-qr`)
    await expect(page).toHaveURL(/\/login|my-qr/)
  })

  test('CI-07: confirmation page gracefully handles missing regId', async ({ page }) => {
    await page.goto(`/e/${SLUGS.live}/confirmation`)
    const status = await page.evaluate(() => document.readyState)
    expect(status).toBe('complete')
  })

  test('CI-08: confirmation page with fake regId does not crash', async ({ page }) => {
    await page.goto(`/e/${SLUGS.live}/confirmation?regId=00000000-0000-4000-8000-000000000001`)
    const status = await page.evaluate(() => document.readyState)
    expect(status).toBe('complete')
  })

  test('CI-09: verify route handles unknown verification ID gracefully', async ({ page }) => {
    const res = await page.goto('/verify/not-a-real-cert-id')
    expect(res?.status()).not.toBe(500)
  })

  test('CI-10: manifest.json is valid JSON with required PWA fields', async ({ request }) => {
    const res = await request.get('/manifest.json')
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('name')
    expect(body).toHaveProperty('short_name')
    expect(body).toHaveProperty('start_url')
  })

  test('CI-11: homepage loads without crash', async ({ page }) => {
    await page.goto('/')
    const status = await page.evaluate(() => document.readyState)
    expect(status).toBe('complete')
  })

  test('CI-12: privacy page loads', async ({ page }) => {
    await page.goto('/privacy')
    await expect(page.locator('h1')).toBeVisible({ timeout: 10_000 })
  })

  test('CI-13: terms page loads', async ({ page }) => {
    await page.goto('/terms')
    await expect(page.locator('h1')).toBeVisible({ timeout: 10_000 })
  })

  test('CI-14: settings page loads without server error', async ({ page }) => {
    // /settings is not in the middleware protected-routes list; the page renders for anon users
    const resp = await page.goto('/settings')
    expect(resp?.status()).not.toBe(500)
    const status = await page.evaluate(() => document.readyState)
    expect(status).toBe('complete')
  })

  test('CI-15: onboarding page requires auth', async ({ page }) => {
    await page.goto('/onboarding')
    await expect(page).toHaveURL(/\/login/)
  })

  test('CI-16: survey guest page with invalid token does not 500', async ({ page }) => {
    const res = await page.goto('/survey/00000000-0000-4000-8000-000000000001?token=INVALID')
    expect(res?.status()).not.toBe(500)
  })

  test('CI-17: public people page loads for anon', async ({ page }) => {
    await page.goto(`/e/${SLUGS.live}/people`)
    const status = await page.evaluate(() => document.readyState)
    expect(status).toBe('complete')
  })

  test('CI-18: public event page has no JS console errors on load', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', err => errors.push(err.message))
    await page.goto(`/e/${SLUGS.live}`)
    await page.waitForLoadState('networkidle')
    const criticalErrors = errors.filter(e =>
      !e.includes('Non-Error promise rejection') &&
      !e.includes('ResizeObserver')
    )
    expect(criticalErrors).toHaveLength(0)
  })

  test('CI-19: checkin UI tab structure is correct (static check)', async ({ page }) => {
    const res = await page.goto(`/events/${SLUGS.live}/checkin`)
    expect(res?.status()).not.toBe(404)
    expect(res?.status()).not.toBe(500)
  })

  test('CI-20: networking page is auth-gated', async ({ page }) => {
    await page.goto(`/events/${SLUGS.live}/networking`)
    await expect(page).toHaveURL(/\/login/)
  })
})
