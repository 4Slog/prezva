/**
 * Development seed script — populates staging/local Supabase with test data.
 * Run: node --env-file=.env.local --import=tsx/esm scripts/seed.ts
 * Or:  npx dotenv-cli -e .env.local npx tsx scripts/seed.ts
 * Requires: service role key set in .env.local
 */

import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import { seedBuiltinRoles } from '../src/lib/orgs/seed-builtin-roles'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or the service role key in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const SEED_EMAIL = 'seed-organizer@prezva.dev'
const SEED_PASSWORD = 'SeedPass123!'

async function seed() {
  console.log('🌱 Seeding Prezva development data...')

  // 1. Create seed user (idempotent — ignore duplicate error)
  const { data: authData } = await supabase.auth.admin.createUser({
    email: SEED_EMAIL,
    password: SEED_PASSWORD,
    email_confirm: true,
  })
  const userId = authData?.user?.id
  if (!userId) { console.error('Could not create seed user'); process.exit(1) }
  console.log(`✓ Seed user: ${SEED_EMAIL} (${userId})`)

  // 2. Create org
  const { data: org } = await supabase
    .from('organizations')
    .upsert({ name: 'Acme Events', slug: 'acme', timezone: 'America/Chicago', created_by: userId }, { onConflict: 'slug' })
    .select().single()
  const orgId = (org as any)?.id
  console.log(`✓ Org: Acme Events (${orgId})`)

  // 3. Seed built-in roles + add org member (owner with role_id)
  let ownerRoleId: string | undefined
  try {
    ownerRoleId = await seedBuiltinRoles(orgId, supabase)
    console.log('✓ Built-in roles seeded (owner/admin/staff)')
  } catch (e) {
    console.warn('⚠ seedBuiltinRoles failed (org has no RBAC roles):', e)
  }
  await supabase.from('org_members').upsert({ org_id: orgId, user_id: userId, role: 'owner', role_id: ownerRoleId ?? null, invited_by: userId }, { onConflict: 'org_id,user_id' })
  console.log('✓ Org member: owner')

  // 4. Create event
  const startAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  const endAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000 + 8 * 60 * 60 * 1000).toISOString()
  const { data: event } = await supabase
    .from('events')
    .upsert({ org_id: orgId, title: 'DevConf 2026', slug: 'devconf-2026', event_type: 'in_person', timezone: 'America/Chicago', start_at: startAt, end_at: endAt, status: 'published', created_by: userId, venue_city: 'Austin', venue_state: 'TX' }, { onConflict: 'org_id,slug' })
    .select().single()
  const eventId = (event as any)?.id
  console.log(`✓ Event: DevConf 2026 (${eventId})`)

  // 5. Create ticket types
  const tickets = [
    { event_id: eventId, name: 'General Admission', type: 'free', price_cents: 0, capacity: 100, sort_order: 1 },
    { event_id: eventId, name: 'VIP', type: 'paid', price_cents: 9900, capacity: 20, sort_order: 2 },
    { event_id: eventId, name: 'Speaker Comp', type: 'comp', price_cents: 0, capacity: 10, sort_order: 3 },
  ]
  const { data: ticketData } = await supabase.from('ticket_types').insert(tickets).select()
  const gaTicketId = (ticketData as any)?.[0]?.id
  console.log(`✓ Ticket types: GA, VIP, Speaker Comp`)

  // 6. Create 10 registrations
  const registrations = Array.from({ length: 10 }, (_, i) => ({
    event_id: eventId,
    ticket_type_id: gaTicketId,
    attendee_email: `attendee${i + 1}@example.com`,
    attendee_name: `Test Attendee ${i + 1}`,
    status: i < 8 ? 'confirmed' : 'waitlisted',
    qr_code: 'PREZVA-' + randomBytes(12).toString('hex').toUpperCase(),
    amount_paid_cents: 0,
  }))
  await supabase.from('registrations').insert(registrations)
  console.log('✓ Registrations: 8 confirmed + 2 waitlisted')

  // 7. Create speakers
  const { data: speakers } = await supabase.from('speakers').insert([
    { event_id: eventId, name: 'Alice Chen', title: 'CTO', company: 'TechCorp', bio: 'Alice leads engineering at TechCorp.', sort_order: 1 },
    { event_id: eventId, name: 'Bob Martinez', title: 'Staff Engineer', company: 'Startup Inc', bio: 'Bob builds distributed systems.', sort_order: 2 },
  ]).select()
  console.log('✓ Speakers: Alice Chen, Bob Martinez')

  // 8. Create agenda sessions
  const sessionStart = new Date(startAt)
  await supabase.from('agenda_sessions').insert([
    { event_id: eventId, title: 'Opening Keynote', start_time: sessionStart.toISOString(), duration_minutes: 60, session_type: 'keynote', sort_order: 1 },
    { event_id: eventId, title: 'Building at Scale', start_time: new Date(sessionStart.getTime() + 90 * 60 * 1000).toISOString(), duration_minutes: 45, session_type: 'talk', sort_order: 2 },
    { event_id: eventId, title: 'Workshop: TypeScript Deep Dive', start_time: new Date(sessionStart.getTime() + 180 * 60 * 1000).toISOString(), duration_minutes: 90, session_type: 'workshop', sort_order: 3 },
    { event_id: eventId, title: 'Lunch Break', start_time: new Date(sessionStart.getTime() + 300 * 60 * 1000).toISOString(), duration_minutes: 60, session_type: 'break', sort_order: 4 },
    { event_id: eventId, title: 'Networking & Closing', start_time: new Date(sessionStart.getTime() + 420 * 60 * 1000).toISOString(), duration_minutes: 60, session_type: 'networking', sort_order: 5 },
  ])
  console.log('✓ Agenda: 5 sessions')

  // 9. Create survey
  const { data: survey } = await supabase.from('surveys').insert({ event_id: eventId, created_by: userId, title: 'Post-Event Feedback', status: 'active' }).select().single()
  const surveyId = (survey as any)?.id
  await supabase.from('survey_questions').insert([
    { survey_id: surveyId, question_text: 'How would you rate the overall event?', question_type: 'rating', is_required: true, sort_order: 1 },
    { survey_id: surveyId, question_text: 'What did you enjoy most?', question_type: 'text', is_required: false, sort_order: 2 },
  ])
  console.log('✓ Survey: Post-Event Feedback with 2 questions')

  console.log('\n✅ Seed complete!')
  console.log(`\nLogin: ${SEED_EMAIL} / ${SEED_PASSWORD}`)
  console.log(`Event: /events/devconf-2026`)
}

seed().catch(err => { console.error(err); process.exit(1) })
