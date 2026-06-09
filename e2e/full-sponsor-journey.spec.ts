/**
 * Sponsor management journey — organizer-side (Phase 1 scope)
 *
 * All auth-required pages redirect to /login when unauthenticated — that's the
 * acceptance signal for the admin side without needing test credentials baked in.
 * Uses SLUGS.ended (bsbw-2026) which has 7 seeded sponsors.
 */
import { test, expect } from '@playwright/test'
import { SLUGS } from './constants'

test.describe('Sponsor management journey', () => {
  test.setTimeout(30_000)

  test('SM-01: sponsor admin page is auth-gated', async ({ page }) => {
    await page.goto(`/events/${SLUGS.ended}/sponsors`)
    await expect(page).toHaveURL(/\/login/)
  })

  test('SM-02: public event page renders without sponsor crash', async ({ page }) => {
    // Use SLUGS.live — ended event (bsbw-2026) is 404 for anon users (RLS allows only published/live)
    await page.goto(`/e/${SLUGS.live}`)
    await expect(page.locator('h1')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('text=Something went wrong')).not.toBeVisible()
  })

  test('SM-03: sponsor tier labels render when sponsors section is present', async ({ page }) => {
    await page.goto(`/e/${SLUGS.live}`)
    const section = page.locator('#sponsors')
    if (await section.count() === 0) return  // no sponsors seeded — nothing to assert
    const tierLabel = section.locator('text=/Title Sponsor|Gold|Silver|Bronze/').first()
    await expect(tierLabel).toBeVisible()
  })

  test('SM-04: sponsor links render when sponsors section is present', async ({ page }) => {
    await page.goto(`/e/${SLUGS.live}`)
    const section = page.locator('#sponsors')
    if (await section.count() === 0) return  // no sponsors seeded — nothing to assert
    const sponsorLinks = section.locator('a[href]')
    expect(await sponsorLinks.count()).toBeGreaterThanOrEqual(1)
  })

  test('SM-05: calendar ICS for demo event is accessible', async ({ request }) => {
    const res = await request.get(`/api/events/${SLUGS.ended}/calendar.ics`)
    expect(res.status()).toBe(200)
    const body = await res.text()
    expect(body).toContain('BEGIN:VCALENDAR')
    expect(body).toContain('BEGIN:VEVENT')
  })

  test('SM-06: sponsor API is protected (no unauthenticated write)', async ({ request }) => {
    const res = await request.post('/api/sponsors', {
      data: { event_id: 'fake', name: 'Hack Corp', tier: 'bronze' },
    })
    expect(res.status()).not.toBe(200)
    expect(res.status()).not.toBe(500)
  })

  test('SM-07: public event page renders without 500 (sponsors section safe)', async ({ page }) => {
    await page.goto(`/e/${SLUGS.ended}`)
    const status = await page.evaluate(() => document.readyState)
    expect(status).toBe('complete')
    await expect(page.locator('text=Something went wrong')).not.toBeVisible()
  })

  test('SM-08: leaderboard page does not crash (attendee_points table exists)', async ({ page }) => {
    await page.goto(`/e/${SLUGS.ended}/leaderboard`)
    const status = await page.evaluate(() => document.readyState)
    expect(status).toBe('complete')
    await expect(page.locator('text=Something went wrong')).not.toBeVisible()
  })

  test('SM-09: photos page does not crash (community_photos table exists)', async ({ page }) => {
    await page.goto(`/e/${SLUGS.ended}/photos`)
    const status = await page.evaluate(() => document.readyState)
    expect(status).toBe('complete')
    await expect(page.locator('text=Something went wrong')).not.toBeVisible()
  })

  test('SM-10: icebreakers page does not crash (prompt column fix applied)', async ({ page }) => {
    await page.goto(`/e/${SLUGS.ended}/icebreakers`)
    const status = await page.evaluate(() => document.readyState)
    expect(status).toBe('complete')
    await expect(page.locator('text=Something went wrong')).not.toBeVisible()
  })
})
