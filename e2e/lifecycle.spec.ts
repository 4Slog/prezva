/**
 * Lifecycle E2E suite — disposable event: register → confirm → attendance → certificate
 *
 * Proves the A2 self-attendance → CE-certificate chain end to end against prod.
 * Creates a throwaway event fixture; destroys it fully after the suite.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in the environment. If absent, the entire
 * describe block is skipped with a clear message.
 *
 * Fixture eligibility design:
 *   - 1 published session, certificate_min_session_attendance_pct = 50
 *   - 0 attendance → 0% < 50% → not eligible (412)
 *   - 1 attendance → 100% >= 50% → eligible (200 PDF)
 */

import { test, expect } from '@playwright/test'
import {
  createLiveEventFixture,
  confirmRegistration,
  findRegistrationByEmail,
  recordSessionAttendance,
  destroyFixture,
  type FixtureResult,
} from './lib/fixture'

const SERVICE_KEY_PRESENT = !!process.env.SUPABASE_SERVICE_ROLE_KEY
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3100'

test.describe('Lifecycle: register → confirm → attendance → certificate', () => {
  if (!SERVICE_KEY_PRESENT) {
    test('(skipped) SUPABASE_SERVICE_ROLE_KEY not set — lifecycle tests require it', async () => {
      test.skip(true, 'Set SUPABASE_SERVICE_ROLE_KEY to run lifecycle tests')
    })
    return
  }

  test.describe.configure({ mode: 'serial' })
  test.setTimeout(60_000)

  let fixture: FixtureResult
  let regId: string
  let certToken: string
  const ts = Date.now()
  const attendeeEmail = `e2e-attendee-${ts}@prezva.test`

  test.beforeAll(async () => {
    const result = await createLiveEventFixture()
    if (!result) throw new Error('lifecycle: createLiveEventFixture returned null — SUPABASE_SERVICE_ROLE_KEY may be missing')
    fixture = result
  })

  test.afterAll(async () => {
    if (fixture) {
      await destroyFixture({ orgId: fixture.orgId, ownerId: fixture.ownerId })
    }
  })

  test('LC-01: fixture public event page loads with register CTA', async ({ page }) => {
    await page.goto(`/e/${fixture.eventSlug}`)
    await expect(page.locator('h1')).toContainText('E2E Lifecycle Event', { timeout: 15_000 })
    // Any register link (CTA label varies by ticket type / invite settings)
    await expect(page.locator(`a[href*="/register"]`).first()).toBeVisible({ timeout: 10_000 })
  })

  test('LC-02: anonymous attendee registers via the real UI', async ({ page }) => {
    await page.goto(`/e/${fixture.eventSlug}/register`)

    // The free ticket card is rendered as a button — click it to select
    await page.locator('button').filter({ hasText: /Free Admission/i }).click()

    // Fill the registration form
    await page.fill('input[name="attendee_first_name"]', 'E2E')
    await page.fill('input[name="attendee_last_name"]', 'Attendee')
    await page.fill('input[name="attendee_email"]', attendeeEmail)

    // Submit (server action → redirect to /confirmation)
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/confirmation/, { timeout: 20_000 })

    // Must show success copy — not an error
    const body = await page.locator('body').textContent()
    expect(body).not.toContain('row-level security')
    expect(body).not.toContain('Internal Server Error')
    await expect(page.locator("text=You're registered!")).toBeVisible({ timeout: 10_000 })

    // Look up the created registration via admin client
    const reg = await findRegistrationByEmail(fixture.eventId, attendeeEmail)
    expect(reg).not.toBeNull()
    regId = reg!.id
    certToken = reg!.certificate_token
  })

  test('LC-03: certificate NOT yet earned → 412', async ({ request }) => {
    // Confirm the registration first so the 412 is from missing attendance, not unconfirmed status
    await confirmRegistration(regId)

    const res = await request.get(`${BASE_URL}/api/certificates/${regId}?token=${certToken}`)
    expect(res.status()).toBe(412)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  test('LC-04: after attendance, certificate IS earned → 200 PDF', async ({ request }) => {
    await recordSessionAttendance({
      eventId: fixture.eventId,
      sessionId: fixture.sessionId,
      registrationId: regId,
    })

    const res = await request.get(`${BASE_URL}/api/certificates/${regId}?token=${certToken}`)
    expect(res.status()).toBe(200)
    const ct = res.headers()['content-type']
    expect(ct).toContain('application/pdf')
  })
})
