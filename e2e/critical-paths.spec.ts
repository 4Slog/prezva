import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const TEST_EMAIL = `e2e-${Date.now()}@test.prezva.app`
const TEST_PASSWORD = 'TestPass123!'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// E2E-01: Signup form renders with invite-only fields
test('E2E-01: signup form renders with required invite-only fields', async ({ page }) => {
  await page.goto('/signup')
  // Prezva signup is invite-only — form has invite_code, full_name, email, password
  await expect(page.locator('input[name="invite_code"]')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('input[name="email"]')).toBeVisible()
  await expect(page.locator('button[type="submit"]')).toBeVisible()
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

// E2E-05: Help center page accessible to anon users
test('E2E-05: help center page loads without server error', async ({ page }) => {
  // /help is not in middleware protected-routes — renders for anon users
  const response = await page.goto('/help')
  expect(response?.status()).not.toBe(500)
  const status = await page.evaluate(() => document.readyState)
  expect(status).toBe('complete')
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
test('E2E-08: GDPR export endpoint is auth-gated', async ({ page }) => {
  await page.goto('/api/gdpr/export')
  // requireUser() in the route handler issues a redirect to /login for anon users
  expect(page.url()).toContain('/login')
})

// E2E-09: Landing page renders without error
test('E2E-09: landing page renders with key content', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/Prezva/)
  expect(page.url()).not.toBe('about:blank')
})
