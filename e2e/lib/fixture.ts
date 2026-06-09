/**
 * Disposable-event fixture for lifecycle E2E tests.
 *
 * Uses the Supabase service role to create isolated test data and tear it
 * down completely after the suite. NOT the golden seed runner — minimal
 * data only.
 *
 * Requires process.env.SUPABASE_SERVICE_ROLE_KEY and
 * process.env.NEXT_PUBLIC_SUPABASE_URL to be set. If absent, the helper
 * returns null and consumers must call test.skip().
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export interface FixtureResult {
  ownerId: string
  orgId: string
  eventId: string
  eventSlug: string
  ticketTypeId: string
  sessionId: string
}

export interface RegistrationRow {
  id: string
  certificate_token: string
  status: string
}

function makeAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function seedBuiltinRolesForFixture(orgId: string, admin: SupabaseClient): Promise<string> {
  // Upsert Owner / Admin / Staff roles
  const { data: upserted, error: rolesErr } = await admin
    .from('roles')
    .upsert(
      [
        { org_id: orgId, name: 'Owner', slug: 'owner', is_builtin: true, description: 'Full access' },
        { org_id: orgId, name: 'Admin', slug: 'admin', is_builtin: true, description: 'Administrative access' },
        { org_id: orgId, name: 'Staff', slug: 'staff', is_builtin: true, description: 'Operational access' },
      ],
      { onConflict: 'org_id,slug', ignoreDuplicates: false },
    )
    .select('id, slug')

  if (rolesErr) throw new Error(`seedBuiltinRoles: roles upsert — ${rolesErr.message}`)

  let roles = upserted ?? []
  if (roles.length < 3) {
    const { data: fetched, error: fetchErr } = await admin
      .from('roles')
      .select('id, slug')
      .eq('org_id', orgId)
      .in('slug', ['owner', 'admin', 'staff'])
      .eq('is_builtin', true)
    if (fetchErr || !fetched || fetched.length < 3) {
      throw new Error(`seedBuiltinRoles: could not resolve role ids — ${fetchErr?.message ?? fetched?.length + ' rows'}`)
    }
    roles = fetched
  }

  const bySlug = Object.fromEntries(roles.map(r => [r.slug as string, r.id as string]))
  if (!bySlug['owner']) throw new Error('seedBuiltinRoles: owner role missing')

  // Fetch all permissions and upsert role_permissions for owner
  const { data: allPerms } = await admin.from('permissions').select('key')
  const allKeys = (allPerms ?? []).map((p: { key: string }) => p.key)
  const adminKeys = allKeys.filter((k: string) => k !== 'org.billing' && k !== 'org.delete')
  const STAFF_KEYS = [
    'agenda.manage','agenda.view','analytics.view','announcements.manage','attendees.edit',
    'attendees.manage','attendees.view','badges.manage','checkin.manage','community.manage',
    'icebreakers.manage','leaderboard.view','networking.view','org.members.view',
    'org.speaker_library.view','org.templates.view','passport.manage','photos.manage',
    'qa.moderate','qa.view','run_of_show.manage','run_of_show.view','speakers.view',
    'sponsors.view','surveys.view','trivia.manage','video.view','volunteers.manage',
  ]

  const rows = [
    ...allKeys.map((k: string) => ({ role_id: bySlug['owner'], permission_key: k })),
    ...adminKeys.map((k: string) => ({ role_id: bySlug['admin'], permission_key: k })),
    ...STAFF_KEYS.map(k => ({ role_id: bySlug['staff'], permission_key: k })),
  ]
  if (rows.length > 0) {
    const { error: rpErr } = await admin
      .from('role_permissions')
      .upsert(rows, { onConflict: 'role_id,permission_key', ignoreDuplicates: true })
    if (rpErr) throw new Error(`seedBuiltinRoles: role_permissions — ${rpErr.message}`)
  }

  return bySlug['owner']
}

export async function createLiveEventFixture(): Promise<FixtureResult | null> {
  const admin = makeAdminClient()
  if (!admin) return null

  const ts = Date.now()
  const ownerEmail = `e2e-owner-${ts}@prezva.test`

  // 1. Create throwaway auth user (trigger creates profile automatically)
  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email: ownerEmail,
    password: 'SeedPass123!',
    email_confirm: true,
  })
  if (authErr || !authData.user) throw new Error(`fixture: createUser — ${authErr?.message}`)
  const ownerId = authData.user.id

  // 2. Create org
  const { data: org, error: orgErr } = await admin
    .from('organizations')
    .insert({ name: `E2E ${ts}`, slug: `e2e-${ts}`, created_by: ownerId })
    .select('id')
    .single()
  if (orgErr || !org) throw new Error(`fixture: create org — ${orgErr?.message}`)
  const orgId = org.id as string

  // 3. Seed builtin roles and get owner role id
  const ownerRoleId = await seedBuiltinRolesForFixture(orgId, admin)

  // 4. Add owner as org member
  const { error: memberErr } = await admin
    .from('org_members')
    .upsert({ org_id: orgId, user_id: ownerId, role: 'owner', role_id: ownerRoleId }, { onConflict: 'org_id,user_id' })
  if (memberErr) throw new Error(`fixture: org_members upsert — ${memberErr.message}`)

  // 5. Create event (start 7 days from now so it's in the future; published so registration works)
  const startAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const endAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000).toISOString()
  const eventSlug = `e2e-${ts}`
  const { data: event, error: eventErr } = await admin
    .from('events')
    .insert({
      org_id: orgId,
      created_by: ownerId,
      title: 'E2E Lifecycle Event',
      slug: eventSlug,
      status: 'published',
      certificate_enabled: true,
      certificate_min_session_attendance_pct: 50,
      start_at: startAt,
      end_at: endAt,
    })
    .select('id')
    .single()
  if (eventErr || !event) throw new Error(`fixture: create event — ${eventErr?.message}`)
  const eventId = event.id as string

  // 6. Create one free ticket type
  const { data: ticket, error: ticketErr } = await admin
    .from('ticket_types')
    .insert({ event_id: eventId, name: 'Free Admission', type: 'free', price_cents: 0 })
    .select('id')
    .single()
  if (ticketErr || !ticket) throw new Error(`fixture: create ticket_type — ${ticketErr?.message}`)
  const ticketTypeId = ticket.id as string

  // 7. Create exactly one published session
  const sessionStartsAt = startAt
  const sessionEndsAt = new Date(new Date(startAt).getTime() + 60 * 60 * 1000).toISOString()
  const { data: session, error: sessionErr } = await admin
    .from('sessions')
    .insert({
      event_id: eventId,
      title: 'Session 1',
      starts_at: sessionStartsAt,
      ends_at: sessionEndsAt,
      is_published: true,
    })
    .select('id')
    .single()
  if (sessionErr || !session) throw new Error(`fixture: create session — ${sessionErr?.message}`)
  const sessionId = session.id as string

  // No certificate_template inserted here — getOrCreateDefaultTemplate() in the cert route
  // creates one with the proper DEFAULT_CERTIFICATE_TEMPLATE.payload on first issuance.

  return { ownerId, orgId, eventId, eventSlug, ticketTypeId, sessionId }
}

export async function confirmRegistration(regId: string): Promise<void> {
  const admin = makeAdminClient()
  if (!admin) throw new Error('fixture: SUPABASE_SERVICE_ROLE_KEY not set')
  const { error } = await admin
    .from('registrations')
    .update({ status: 'confirmed' })
    .eq('id', regId)
  if (error) throw new Error(`fixture: confirmRegistration — ${error.message}`)
}

export async function findRegistrationByEmail(
  eventId: string,
  email: string,
): Promise<RegistrationRow | null> {
  const admin = makeAdminClient()
  if (!admin) return null
  const { data, error } = await admin
    .from('registrations')
    .select('id, certificate_token, status')
    .eq('event_id', eventId)
    .eq('attendee_email', email)
    .maybeSingle()
  if (error) throw new Error(`fixture: findRegistrationByEmail — ${error.message}`)
  return data ? { id: data.id as string, certificate_token: data.certificate_token as string, status: data.status as string } : null
}

export async function recordSessionAttendance(opts: {
  eventId: string
  sessionId: string
  registrationId: string
}): Promise<void> {
  const admin = makeAdminClient()
  if (!admin) throw new Error('fixture: SUPABASE_SERVICE_ROLE_KEY not set')
  const { error } = await admin
    .from('session_attendance')
    .insert({
      session_id: opts.sessionId,
      registration_id: opts.registrationId,
      event_id: opts.eventId,
    })
  if (error && !error.message.includes('duplicate')) {
    throw new Error(`fixture: recordSessionAttendance — ${error.message}`)
  }
}

export async function destroyFixture(opts: { orgId: string; ownerId: string }): Promise<void> {
  const admin = makeAdminClient()
  if (!admin) return

  const { orgId, ownerId } = opts

  // Get event IDs for this org first
  const { data: events } = await admin.from('events').select('id').eq('org_id', orgId)
  const eventIds = (events ?? []).map((e: { id: string }) => e.id)

  if (eventIds.length > 0) {
    // Delete in FK order: attendance → registrations → sessions → ticket_types → issued_certificates
    await admin.from('session_attendance').delete().in('event_id', eventIds)
    await admin.from('issued_certificates').delete().in('event_id', eventIds)
    await admin.from('registrations').delete().in('event_id', eventIds)
    await admin.from('sessions').delete().in('event_id', eventIds)
    await admin.from('ticket_types').delete().in('event_id', eventIds)
  }

  // certificate_templates, org_members, role_permissions, roles, events, org
  await admin.from('certificate_templates').delete().eq('org_id', orgId)

  const { data: roles } = await admin.from('roles').select('id').eq('org_id', orgId)
  const roleIds = (roles ?? []).map((r: { id: string }) => r.id)
  if (roleIds.length > 0) {
    await admin.from('role_permissions').delete().in('role_id', roleIds)
  }

  await admin.from('org_members').delete().eq('org_id', orgId)
  await admin.from('roles').delete().eq('org_id', orgId)
  await admin.from('events').delete().eq('org_id', orgId)
  await admin.from('organizations').delete().eq('id', orgId)

  // Delete auth user (cascades to profile)
  await admin.auth.admin.deleteUser(ownerId)
}
