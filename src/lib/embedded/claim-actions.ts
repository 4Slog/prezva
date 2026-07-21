'use server'

import { cookies } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'
import { createClient as createSupabaseJsClient, type SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyEmbeddedSession, mintEmbeddedSession, COOKIE_NAME } from '@/lib/embedded/session'
import { hasPermission } from '@/lib/auth/assert-permission'
import { seedBuiltinRoles } from '@/lib/orgs/seed-builtin-roles'
import { logAudit } from '@/lib/audit/log'
import { ghlAdapter } from '@/lib/integrations/ghl/adapter'
import { provisionGhlOrgConfig } from '@/lib/integrations/ghl/provisioner'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ClaimAuthResult =
  | { ok: true; claimToken: string }
  | { confirmEmail: true }
  | { error: string }

export type OrgChoice =
  | { type: 'existing'; orgId: string }
  | { type: 'new'; name: string }

export type ClaimLocationResult =
  | { ok: true; next: string }
  | { error: 'session_expired' | 'forbidden' | 'install_missing' | 'already_claimed' | string }

export interface ClaimOrgOption {
  id: string
  name: string
}

// ── Ephemeral (non-persisted) credential verification ───────────────────────
//
// This must NEVER touch next/headers cookies: the embed runs cross-site
// inside the GHL iframe, and a standard Supabase SSR session cookie is
// sameSite:lax, which the browser drops there. persistSession:false plus the
// plain supabase-js client (no @supabase/ssr cookie plumbing at all) means
// signIn/signUp verify credentials server-side and then leave zero session
// state behind — embedded_session (sameSite:none) stays the only cookie.
function createEphemeralAuthClient() {
  return createSupabaseJsClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// ── Claim token ───────────────────────────────────────────────────────────────
//
// Short-lived, signed, purpose-scoped proof that a specific user just passed
// credential verification. The claim UI carries this in component state
// (never a cookie) between the auth step and the org step. claimLocation
// verifies it server-side instead of trusting a client-supplied user id —
// without this, claimLocation would have no way to know WHO is claiming
// without either persisting a session cookie (ruled out above) or trusting
// unverified client input (an auth bypass). Shares EMBEDDED_SESSION_SECRET
// with the embedded_session JWT; the `purpose` claim keeps the two token
// kinds from being interchangeable.
const CLAIM_TOKEN_PURPOSE = 'ghl_claim'
const CLAIM_TOKEN_EXPIRY = '10m'

function getClaimTokenSecret(): Uint8Array {
  const secret = process.env.EMBEDDED_SESSION_SECRET
  if (!secret) throw new Error('EMBEDDED_SESSION_SECRET is not set')
  return new TextEncoder().encode(secret)
}

async function mintClaimToken(userId: string, email: string | null): Promise<string> {
  const payload: Record<string, unknown> = { purpose: CLAIM_TOKEN_PURPOSE, sub: userId }
  if (email) payload.email = email
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(CLAIM_TOKEN_EXPIRY)
    .sign(getClaimTokenSecret())
}

async function verifyClaimToken(token: string): Promise<{ userId: string; email: string | null } | null> {
  try {
    const { payload } = await jwtVerify(token, getClaimTokenSecret())
    if (payload.purpose !== CLAIM_TOKEN_PURPOSE || typeof payload.sub !== 'string') return null
    return { userId: payload.sub, email: typeof payload.email === 'string' ? payload.email : null }
  } catch {
    return null
  }
}

// ── Sign in / sign up ─────────────────────────────────────────────────────────

export async function claimSignIn(formData: FormData): Promise<ClaimAuthResult> {
  const email = (formData.get('email') as string | null)?.trim() ?? ''
  const password = (formData.get('password') as string | null) ?? ''
  if (!email || !password) return { error: 'Email and password are required.' }

  const auth = createEphemeralAuthClient()
  const { data, error } = await auth.auth.signInWithPassword({ email, password })
  if (error || !data.user) return { error: error?.message ?? 'Sign-in failed.' }

  const claimToken = await mintClaimToken(data.user.id, data.user.email ?? email)
  return { ok: true, claimToken }
}

export async function claimSignUp(formData: FormData): Promise<ClaimAuthResult> {
  const email = (formData.get('email') as string | null)?.trim() ?? ''
  const password = (formData.get('password') as string | null) ?? ''
  const fullName = (formData.get('full_name') as string | null)?.trim() ?? ''
  if (!email || !password) return { error: 'Email and password are required.' }

  const auth = createEphemeralAuthClient()
  const { data, error } = await auth.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  })
  if (error) return { error: error.message }
  if (!data.user) return { error: 'Sign-up failed.' }

  // Confirmation-required projects return a user row with no session.
  // Nothing to claim with yet — send them to confirm, then sign in.
  if (!data.session) return { confirmEmail: true }

  const claimToken = await mintClaimToken(data.user.id, data.user.email ?? email)
  return { ok: true, claimToken }
}

// ── Org picker ────────────────────────────────────────────────────────────────

export async function getClaimOrgs(claimToken: string): Promise<{ orgs: ClaimOrgOption[] } | { error: string }> {
  const claim = await verifyClaimToken(claimToken)
  if (!claim) return { error: 'session_expired' }

  const admin = createAdminClient()
  const { data: memberships } = await admin
    .from('org_members')
    .select('org_id, role_id, organizations(id, name)')
    .eq('user_id', claim.userId)

  if (!memberships || memberships.length === 0) return { orgs: [] }

  const roleIds = [...new Set(memberships.map((m) => m.role_id).filter((id: unknown): id is string => Boolean(id)))]
  if (roleIds.length === 0) return { orgs: [] }

  const { data: perms } = await admin
    .from('role_permissions')
    .select('role_id')
    .eq('permission_key', 'org.settings')
    .in('role_id', roleIds)

  const allowedRoleIds = new Set((perms ?? []).map((p: { role_id: string }) => p.role_id))

  const orgs: ClaimOrgOption[] = []
  for (const m of memberships) {
    if (!m.role_id || !allowedRoleIds.has(m.role_id)) continue
    const org = m.organizations as unknown as { id: string; name: string } | null
    if (org) orgs.push({ id: org.id, name: org.name })
  }

  return { orgs }
}

// ── Org creation (embed-lane only — no invite-code gate) ─────────────────────
//
// The standalone lane's createOrganization() requires an invite code for a
// user's first org — an anti-abuse control for organic standalone signups.
// A GHL marketplace claim is a different origination: install is free (R36)
// and the claim page's whole purpose is letting a cold-install user stand up
// an org with zero friction. Reusing the invite-gated helper would silently
// break that. seedBuiltinRoles IS reused — it's generic RBAC seeding with no
// gate attached.
function toOrgSlug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'org'
}

async function generateUniqueOrgSlug(admin: SupabaseClient, base: string): Promise<string> {
  let slug = base
  let suffix = 2
  for (let i = 0; i < 20; i++) {
    const { data } = await admin.from('organizations').select('id').eq('slug', slug).maybeSingle()
    if (!data) return slug
    slug = `${base}-${suffix++}`
  }
  throw new Error('Could not generate a unique organization slug')
}

async function createClaimOrg(
  admin: SupabaseClient,
  name: string,
  userId: string,
): Promise<{ id: string } | { error: string }> {
  const trimmed = name.trim()
  if (trimmed.length < 2) return { error: 'Organization name is too short.' }

  const slug = await generateUniqueOrgSlug(admin, toOrgSlug(trimmed))

  const { data: org, error: orgErr } = await admin
    .from('organizations')
    .insert({ name: trimmed, slug, created_by: userId })
    .select('id')
    .single()
  if (orgErr || !org) return { error: orgErr?.message ?? 'Failed to create organization' }

  let ownerRoleId: string
  try {
    ownerRoleId = await seedBuiltinRoles(org.id, admin)
  } catch (e) {
    console.error('[claim] seedBuiltinRoles failed:', e)
    return { error: 'Organization created but role setup failed.' }
  }

  const { error: memberErr } = await admin.from('org_members').insert({
    org_id: org.id, user_id: userId, role: 'owner', role_id: ownerRoleId, invited_by: userId,
  })
  if (memberErr) return { error: memberErr.message }

  await logAudit(admin, org.id, userId, 'org.create', 'organization', org.id)
  return { id: org.id }
}

// ── Location claim ────────────────────────────────────────────────────────────

async function getSessionLocationId(): Promise<string | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return null
  try {
    const session = await verifyEmbeddedSession(token)
    return session.location_id
  } catch {
    return null
  }
}

async function remintSession(locationId: string, email: string | null): Promise<void> {
  const token = await mintEmbeddedSession(locationId, email ?? undefined)
  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'none',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60,
  })
}

export async function claimLocation(claimToken: string, orgChoice: OrgChoice): Promise<ClaimLocationResult> {
  const claim = await verifyClaimToken(claimToken)
  if (!claim) return { error: 'session_expired' }

  // CRITICAL: the location comes ONLY from the verified embedded_session
  // JWT — the SSO-attested location for this iframe session — never from
  // anything the claim form posts. A client-supplied location id would let
  // anyone bind an arbitrary GHL location to their own org.
  const locationId = await getSessionLocationId()
  if (!locationId) return { error: 'session_expired' }

  const admin = createAdminClient()

  // Already-linked short-circuit (prior claim, or a race with another
  // admin): the location already has a home. Re-mint and send them back in
  // rather than silently rebinding it to a different org.
  const { data: existingLink } = await admin
    .from('ghl_location_links')
    .select('org_id')
    .eq('ghl_location_id', locationId)
    .maybeSingle()

  if (existingLink) {
    await remintSession(locationId, claim.email)
    return { ok: true, next: '/embedded/events' }
  }

  // Neither a pending install nor an existing link covers this location —
  // nothing was ever installed for it (or the install row expired/was lost).
  const { data: pendingRow } = await admin
    .from('ghl_pending_installs')
    .select('ghl_location_id')
    .eq('ghl_location_id', locationId)
    .maybeSingle()
  if (!pendingRow) return { error: 'install_missing' }

  let orgId: string
  if (orgChoice.type === 'existing') {
    const allowed = await hasPermission(orgChoice.orgId, claim.userId, 'org.settings')
    if (!allowed) return { error: 'forbidden' }
    orgId = orgChoice.orgId
  } else {
    const result = await createClaimOrg(admin, orgChoice.name, claim.userId)
    if ('error' in result) return { error: result.error }
    orgId = result.id
  }

  // claimPendingInstall's DELETE...RETURNING is the actual race lock — the
  // pendingRow check above is only a fast-path hint and can go stale between
  // that read and this call. A null result here means someone else's delete
  // won; disambiguate by re-checking ghl_location_links rather than assuming
  // install_missing (which would be misleading — the install DID complete,
  // just not for this caller).
  const claimed = await ghlAdapter.claimPendingInstall(locationId, orgId)
  if (!claimed) {
    const { data: linkAfterRace } = await admin
      .from('ghl_location_links')
      .select('org_id')
      .eq('ghl_location_id', locationId)
      .maybeSingle()
    return { error: linkAfterRace ? 'already_claimed' : 'install_missing' }
  }

  try {
    await provisionGhlOrgConfig(admin, claimed.accessToken, orgId, locationId)
  } catch (e) {
    console.error('[claim] provisionGhlOrgConfig failed for org', orgId, e instanceof Error ? e.message : String(e))
  }

  await remintSession(locationId, claim.email)
  return { ok: true, next: '/embedded/events' }
}
