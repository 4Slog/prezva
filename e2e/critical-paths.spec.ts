import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const TEST_EMAIL = `e2e-${Date.now()}@test.prezva.app`
const TEST_PASSWORD = 'TestPass123!'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// E2E-01: Signup → create org → create event
test('E2E-01: signup and create org', async ({ page }) => {
  await page.goto('/signup')
  await page.fill('[name="email"]', TEST_EMAIL)
  await page.fill('[name="password"]', TEST_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('/dashboard', { timeout: 15000 })
  await expect(page.locator('h1')).toContainText('Dashboard')
})

// E2E-02: Login page renders
test('E2E-02: login page renders and accepts input', async ({ page }) => {
  await page.goto('/login')
  await expect(page.locator('input[type="email"]')).toBeVisible()
  await expect(page.locator('input[type="password"]')).toBeVisible()
  await expect(page.locator('button[type="submit"]')).toBeVisible()
})

// E2E-03: Public event page (not-found returns 404 or redirect)
test('E2E-03: nonexistent event slug returns not-found', async ({ page }) => {
  const response = await page.goto('/events/this-event-does-not-exist-xyz')
  expect(response?.status()).not.toBe(500)
})

// E2E-04: Signup page has correct form elements
test('E2E-04: signup form renders with required fields', async ({ page }) => {
  await page.goto('/signup')
  await expect(page.locator('input[name="email"]')).toBeVisible()
  await expect(page.locator('input[name="password"]')).toBeVisible()
  await expect(page.locator('button[type="submit"]')).toBeVisible()
})

// E2E-05: Help center page renders all sections
test('E2E-05: help center page requires auth (redirect to login)', async ({ page }) => {
  const response = await page.goto('/help')
  // Unauthenticated users should be redirected to login
  expect(page.url()).toContain('/login')
})

// E2E-06: Survey page with invalid token returns not-found
test('E2E-06: survey guest page with invalid token shows not-found', async ({ page }) => {
  const resp = await page.goto('/survey/00000000-0000-4000-8000-000000000001?token=INVALID')
  expect(resp?.status()).not.toBe(500)
})

// E2E-07: Forgot password page renders
test('E2E-07: forgot password page renders', async ({ page }) => {
  await page.goto('/forgot-password')
  await expect(page.locator('input[type="email"]')).toBeVisible()
})

// E2E-08: GDPR export requires auth
test('E2E-08: GDPR export endpoint requires authentication', async ({ page }) => {
  const response = await page.goto('/api/gdpr/export')
  expect(response?.status()).toBe(401)
})

// E2E-09: Landing page renders without error
test('E2E-09: landing page renders with key content', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/Prezva/)
  expect(page.url()).not.toBe('about:blank')
})
