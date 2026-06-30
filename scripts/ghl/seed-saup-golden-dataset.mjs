/**
 * Phase 1.2 — SAUP GHL Golden Dataset Seed
 * Creates 50 GHL contacts + opportunities mirroring Prezva confirmed registrations.
 * Idempotent: checks for existing opps by name prefix before creating.
 * Run: node scripts/ghl/seed-saup-golden-dataset.mjs
 */

import fs from 'fs'
import path from 'path'

// Load .env.local manually
const envPath = path.resolve('.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx < 0) continue
    const key = trimmed.slice(0, idx).trim()
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '')
    if (!process.env[key]) process.env[key] = val
  }
}

const GHL_BASE = 'https://services.leadconnectorhq.com'
const GHL_VERSION = '2021-07-28'
const LOC_ID = '4KrDX2FYA2XZ68q88rFS'
const PIPELINE_ID = 'oTf46hAR05Cnms51VGeC'
const EVENT_ID = '01000002-0002-4001-8001-000000000000'
const MEM_TT = '04000003-0002-4001-8001-000000000000'
const OPP_NAME_PREFIX = '[Prezva] SAUP Annual CE Conference 2026 —'

const STAGES = {
  PAYMENT_PENDING: '5e0e12f8-6784-4293-94e5-39aeb3be66a5',
  REGISTERED:      'd08d5780-342c-4a09-9cbf-7c0ab80eb4af',
  CONFIRMED:       'e847ee8a-4296-4563-aa24-e6e89d99b844',
  CHECKED_IN:      '3c092619-1b13-48bd-83a2-d9f1e616e46f',
  ATTENDED:        '0ea76af1-8a73-4fa1-bd2d-0e71f36b2411',
  NO_SHOW:         'cbfcb165-c227-4e1c-ae22-6d2cd8b9856c',
  CERT_ISSUED:     '8c559023-3634-47cb-b111-6827254bf9b6',
}

const FIELD_IDS = {
  event_id:        'pZB1j7QMFIFzlvmbE4Om',
  registration_id: 'xgwB65VeroEozIlRNyFS',
  ticket_type:     'kDw7hGlT9kp7lZbFLfLb',
  payment_status:  '6fyY04s1yyTmpic653C0',
  source:          'NfkhHIBJc3Etvq15iQnl',
  last_sync_time:  'bYbFHamdFhi4apJXhP9t',
  ce_credits:      '4mYrFTnrQvdMUQ19LMSt',
  attendance_pct:  'jN0w8V3yMDLQaIJcp5pO',
}

// Randomly-sampled 50 confirmed registrations (29 Member + 21 Non-Member)
const SAMPLE = [
  // ── AICP Member (29) ──────────────────────────────────────────────────────
  {id:'08000002-0045-4001-8001-000000000045',ticket_type_id:MEM_TT,attendee_name:'Joseph Adams',attendee_email:'joseph.adams.64@icloud.com',amount_paid_cents:22500},
  {id:'08000002-009d-4001-8001-00000000009d',ticket_type_id:MEM_TT,attendee_name:'Michael Turner',attendee_email:'michael.turner.152@outlook.com',amount_paid_cents:22500},
  {id:'08000002-0042-4001-8001-000000000042',ticket_type_id:MEM_TT,attendee_name:'Jason Sanchez',attendee_email:'jason.sanchez.61@outlook.com',amount_paid_cents:22500},
  {id:'08000002-0044-4001-8001-000000000044',ticket_type_id:MEM_TT,attendee_name:'Ronald Garcia',attendee_email:'ronald.garcia.63@protonmail.com',amount_paid_cents:22500},
  {id:'08000002-00c0-4001-8001-0000000000c0',ticket_type_id:MEM_TT,attendee_name:'Joshua Turner',attendee_email:'joshua.turner.187@icloud.com',amount_paid_cents:22500},
  {id:'08000002-00bf-4001-8001-0000000000bf',ticket_type_id:MEM_TT,attendee_name:'Joshua Turner',attendee_email:'joshua.turner.186@protonmail.com',amount_paid_cents:22500},
  {id:'08000002-0064-4001-8001-000000000064',ticket_type_id:MEM_TT,attendee_name:'Daniel Rivera',attendee_email:'daniel.rivera.95@live.com',amount_paid_cents:22500},
  {id:'08000002-0052-4001-8001-000000000052',ticket_type_id:MEM_TT,attendee_name:'Joseph Perez',attendee_email:'joseph.perez.77@outlook.com',amount_paid_cents:22500},
  {id:'08000002-00ea-4001-8001-0000000000ea',ticket_type_id:MEM_TT,attendee_name:'Daniel Edwards',attendee_email:'daniel.edwards.229@icloud.com',amount_paid_cents:22500},
  {id:'08000002-0091-4001-8001-000000000091',ticket_type_id:MEM_TT,attendee_name:'John Edwards',attendee_email:'john.edwards.140@outlook.com',amount_paid_cents:22500},
  {id:'08000002-00a9-4001-8001-0000000000a9',ticket_type_id:MEM_TT,attendee_name:'Joshua Adams',attendee_email:'joshua.adams.164@gmail.com',amount_paid_cents:22500},
  {id:'08000002-0016-4001-8001-000000000016',ticket_type_id:MEM_TT,attendee_name:'John Johnson',attendee_email:'john.johnson.17@gmail.com',amount_paid_cents:22500},
  {id:'08000002-0088-4001-8001-000000000088',ticket_type_id:MEM_TT,attendee_name:'Daniel Rivera',attendee_email:'daniel.rivera.131@icloud.com',amount_paid_cents:22500},
  {id:'08000002-001a-4001-8001-00000000001a',ticket_type_id:MEM_TT,attendee_name:'John Adams',attendee_email:'john.adams.21@protonmail.com',amount_paid_cents:22500},
  {id:'08000002-00bb-4001-8001-0000000000bb',ticket_type_id:MEM_TT,attendee_name:'Donald Moore',attendee_email:'donald.moore.182@icloud.com',amount_paid_cents:22500},
  {id:'08000002-00aa-4001-8001-0000000000aa',ticket_type_id:MEM_TT,attendee_name:'Anthony Garcia',attendee_email:'anthony.garcia.165@protonmail.com',amount_paid_cents:22500},
  {id:'08000002-00be-4001-8001-0000000000be',ticket_type_id:MEM_TT,attendee_name:'Ryan Rivera',attendee_email:'ryan.rivera.185@gmail.com',amount_paid_cents:22500},
  {id:'08000002-006b-4001-8001-00000000006b',ticket_type_id:MEM_TT,attendee_name:'Brian Johnson',attendee_email:'brian.johnson.102@outlook.com',amount_paid_cents:22500},
  {id:'08000002-007c-4001-8001-00000000007c',ticket_type_id:MEM_TT,attendee_name:'Ronald Johnson',attendee_email:'ronald.johnson.119@gmail.com',amount_paid_cents:22500},
  {id:'08000002-005b-4001-8001-00000000005b',ticket_type_id:MEM_TT,attendee_name:'Michael Turner',attendee_email:'michael.turner.86@outlook.com',amount_paid_cents:22500},
  {id:'08000002-0075-4001-8001-000000000075',ticket_type_id:MEM_TT,attendee_name:'Donald Martinez',attendee_email:'donald.martinez.112@gmail.com',amount_paid_cents:22500},
  {id:'08000002-00af-4001-8001-0000000000af',ticket_type_id:MEM_TT,attendee_name:'Joseph Johnson',attendee_email:'joseph.johnson.170@outlook.com',amount_paid_cents:22500},
  {id:'08000002-00a8-4001-8001-0000000000a8',ticket_type_id:MEM_TT,attendee_name:'Daniel Turner',attendee_email:'daniel.turner.163@gmail.com',amount_paid_cents:22500},
  {id:'08000002-00ba-4001-8001-0000000000ba',ticket_type_id:MEM_TT,attendee_name:'Michael Turner',attendee_email:'michael.turner.181@outlook.com',amount_paid_cents:22500},
  {id:'08000002-0006-4001-8001-000000000006',ticket_type_id:MEM_TT,attendee_name:'Ronald Turner',attendee_email:'ronald.turner.1@live.com',amount_paid_cents:22500},
  {id:'08000002-00d4-4001-8001-0000000000d4',ticket_type_id:MEM_TT,attendee_name:'Brian Moore',attendee_email:'brian.moore.207@gmail.com',amount_paid_cents:22500},
  {id:'08000002-0040-4001-8001-000000000040',ticket_type_id:MEM_TT,attendee_name:'Paul Robinson',attendee_email:'paul.robinson.59@live.com',amount_paid_cents:22500},
  {id:'08000002-0011-4001-8001-000000000011',ticket_type_id:MEM_TT,attendee_name:'Joseph Martinez',attendee_email:'joseph.martinez.12@live.com',amount_paid_cents:22500},
  {id:'08000002-0072-4001-8001-000000000072',ticket_type_id:MEM_TT,attendee_name:'Michael Roberts',attendee_email:'michael.roberts.109@icloud.com',amount_paid_cents:22500},
  // ── Non-Member (21) ───────────────────────────────────────────────────────
  {id:'08000002-0099-4001-8001-000000000099',ticket_type_id:'04000004-0002-4001-8001-000000000000',attendee_name:'Michael Wilson',attendee_email:'michael.wilson.148@icloud.com',amount_paid_cents:37500},
  {id:'08000002-00ac-4001-8001-0000000000ac',ticket_type_id:'04000004-0002-4001-8001-000000000000',attendee_name:'Joseph Roberts',attendee_email:'joseph.roberts.167@outlook.com',amount_paid_cents:37500},
  {id:'08000002-0034-4001-8001-000000000034',ticket_type_id:'04000004-0002-4001-8001-000000000000',attendee_name:'John Wilson',attendee_email:'john.wilson.47@icloud.com',amount_paid_cents:37500},
  {id:'08000002-007b-4001-8001-00000000007b',ticket_type_id:'04000004-0002-4001-8001-000000000000',attendee_name:'Charles Edwards',attendee_email:'charles.edwards.118@gmail.com',amount_paid_cents:37500},
  {id:'08000002-0062-4001-8001-000000000062',ticket_type_id:'04000004-0002-4001-8001-000000000000',attendee_name:'David Roberts',attendee_email:'david.roberts.93@outlook.com',amount_paid_cents:37500},
  {id:'08000002-00c7-4001-8001-0000000000c7',ticket_type_id:'04000004-0002-4001-8001-000000000000',attendee_name:'John Perez',attendee_email:'john.perez.194@outlook.com',amount_paid_cents:37500},
  {id:'08000002-00ae-4001-8001-0000000000ae',ticket_type_id:'04000004-0002-4001-8001-000000000000',attendee_name:'Ryan Sanchez',attendee_email:'ryan.sanchez.169@icloud.com',amount_paid_cents:37500},
  {id:'08000002-00f7-4001-8001-0000000000f7',ticket_type_id:'04000004-0002-4001-8001-000000000000',attendee_name:'John Sanchez',attendee_email:'john.sanchez.242@protonmail.com',amount_paid_cents:37500},
  {id:'08000002-005c-4001-8001-00000000005c',ticket_type_id:'04000004-0002-4001-8001-000000000000',attendee_name:'Brian Perez',attendee_email:'brian.perez.87@gmail.com',amount_paid_cents:37500},
  {id:'08000002-008c-4001-8001-00000000008c',ticket_type_id:'04000004-0002-4001-8001-000000000000',attendee_name:'Ryan Adams',attendee_email:'ryan.adams.135@icloud.com',amount_paid_cents:37500},
  {id:'08000002-0079-4001-8001-000000000079',ticket_type_id:'04000004-0002-4001-8001-000000000000',attendee_name:'Donald Turner',attendee_email:'donald.turner.116@outlook.com',amount_paid_cents:37500},
  {id:'08000002-0078-4001-8001-000000000078',ticket_type_id:'04000004-0002-4001-8001-000000000000',attendee_name:'John Robinson',attendee_email:'john.robinson.115@live.com',amount_paid_cents:37500},
  {id:'08000002-008b-4001-8001-00000000008b',ticket_type_id:'04000004-0002-4001-8001-000000000000',attendee_name:'Daniel Roberts',attendee_email:'daniel.roberts.134@protonmail.com',amount_paid_cents:37500},
  {id:'08000002-00de-4001-8001-0000000000de',ticket_type_id:'04000004-0002-4001-8001-000000000000',attendee_name:'Michael Johnson',attendee_email:'michael.johnson.217@live.com',amount_paid_cents:37500},
  {id:'08000002-00b4-4001-8001-0000000000b4',ticket_type_id:'04000004-0002-4001-8001-000000000000',attendee_name:'Daniel King',attendee_email:'daniel.king.175@gmail.com',amount_paid_cents:37500},
  {id:'08000002-0089-4001-8001-000000000089',ticket_type_id:'04000004-0002-4001-8001-000000000000',attendee_name:'Charles Nguyen',attendee_email:'charles.nguyen.132@gmail.com',amount_paid_cents:37500},
  {id:'08000002-00ce-4001-8001-0000000000ce',ticket_type_id:'04000004-0002-4001-8001-000000000000',attendee_name:'Ryan Johnson',attendee_email:'ryan.johnson.201@gmail.com',amount_paid_cents:37500},
  {id:'08000002-0031-4001-8001-000000000031',ticket_type_id:'04000004-0002-4001-8001-000000000000',attendee_name:'Ronald Sanchez',attendee_email:'ronald.sanchez.44@gmail.com',amount_paid_cents:37500},
  {id:'08000002-00d0-4001-8001-0000000000d0',ticket_type_id:'04000004-0002-4001-8001-000000000000',attendee_name:'Anthony Turner',attendee_email:'anthony.turner.203@icloud.com',amount_paid_cents:37500},
  {id:'08000002-0047-4001-8001-000000000047',ticket_type_id:'04000004-0002-4001-8001-000000000000',attendee_name:'John Martinez',attendee_email:'john.martinez.66@icloud.com',amount_paid_cents:37500},
  {id:'08000002-00dd-4001-8001-0000000000dd',ticket_type_id:'04000004-0002-4001-8001-000000000000',attendee_name:'Michael Perez',attendee_email:'michael.perez.216@live.com',amount_paid_cents:37500},
]

// Stage assignment: indices 0-49
const STAGE_PLAN = [
  // [startIdx, count, stageName, stageId]
  [0,  3,  'PAYMENT_PENDING', STAGES.PAYMENT_PENDING],
  [3,  11, 'REGISTERED',      STAGES.REGISTERED],
  [14, 12, 'CONFIRMED',       STAGES.CONFIRMED],
  [26, 9,  'CHECKED_IN',      STAGES.CHECKED_IN],
  [35, 7,  'ATTENDED',        STAGES.ATTENDED],
  [42, 2,  'NO_SHOW',         STAGES.NO_SHOW],
  [44, 6,  'CERT_ISSUED',     STAGES.CERT_ISSUED],
]

function getStage(idx) {
  for (const [start, count, name, id] of STAGE_PLAN) {
    if (idx >= start && idx < start + count) return { name, id }
  }
  throw new Error(`No stage for index ${idx}`)
}

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1))
}

function buildCustomFields(reg, stageName, syncTime) {
  const isMember = reg.ticket_type_id === MEM_TT
  const paymentStatus = stageName === 'PAYMENT_PENDING' ? 'pending' : 'paid'
  const ticketType = isMember ? 'AICP Member' : 'Non-Member'

  const fields = [
    { id: FIELD_IDS.event_id,        value: EVENT_ID },
    { id: FIELD_IDS.registration_id, value: reg.id },
    { id: FIELD_IDS.ticket_type,     value: ticketType },
    { id: FIELD_IDS.payment_status,  value: paymentStatus },
    { id: FIELD_IDS.source,          value: 'golden_dataset' },
    { id: FIELD_IDS.last_sync_time,  value: syncTime },
  ]

  if (['CHECKED_IN', 'ATTENDED', 'CERT_ISSUED'].includes(stageName)) {
    const pctRange = stageName === 'CHECKED_IN' ? [80, 95]
                   : stageName === 'ATTENDED'   ? [85, 100]
                   :                              [90, 100]
    fields.push({ id: FIELD_IDS.attendance_pct, value: String(randInt(...pctRange)) })
  }

  if (stageName === 'CERT_ISSUED') {
    fields.push({ id: FIELD_IDS.ce_credits, value: '8' })
  }

  return fields
}

function ghlHeaders() {
  const token = process.env.GHL_API_TOKEN
  if (!token) throw new Error('GHL_API_TOKEN not set')
  return {
    Authorization: `Bearer ${token}`,
    Version: GHL_VERSION,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function upsertContact(reg) {
  const parts = reg.attendee_name.trim().split(' ')
  const firstName = parts[0]
  const lastName = parts.slice(1).join(' ') || '-'

  const body = {
    firstName,
    lastName,
    email: reg.attendee_email,
    locationId: LOC_ID,
  }

  const res = await fetch(`${GHL_BASE}/contacts/upsert`, {
    method: 'POST',
    headers: ghlHeaders(),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Upsert contact failed ${res.status}: ${err}`)
  }
  const data = await res.json()
  return data.contact?.id ?? data.id
}

async function createOpp(reg, contactId, stageId, stageName, syncTime) {
  const isMember = reg.ticket_type_id === MEM_TT
  const name = `${OPP_NAME_PREFIX} ${reg.attendee_name}`
  const monetaryValue = reg.amount_paid_cents / 100

  const body = {
    pipelineId: PIPELINE_ID,
    pipelineStageId: stageId,
    locationId: LOC_ID,
    contactId,
    name,
    status: 'open',
    monetaryValue,
    customFields: buildCustomFields(reg, stageName, syncTime),
  }

  const res = await fetch(`${GHL_BASE}/opportunities/`, {
    method: 'POST',
    headers: ghlHeaders(),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Create opp failed ${res.status}: ${err}`)
  }
  const data = await res.json()
  return data.opportunity?.id ?? data.id
}

async function getExistingOppNames() {
  const res = await fetch(
    `${GHL_BASE}/opportunities/search?location_id=${LOC_ID}&pipeline_id=${PIPELINE_ID}&limit=100`,
    { headers: ghlHeaders() }
  )
  if (!res.ok) throw new Error(`Search opps failed: ${res.status}`)
  const data = await res.json()
  return new Set((data.opportunities ?? []).map(o => o.name))
}

async function main() {
  const syncTime = new Date().toISOString()
  console.log(`\nSAUP Golden Dataset Seed — ${syncTime}`)
  console.log(`Sample: ${SAMPLE.length} registrations (29 Member + 21 Non-Member)\n`)

  console.log('Checking existing opps for idempotency...')
  const existingNames = await getExistingOppNames()
  console.log(`Existing opps in pipeline: ${existingNames.size}`)

  const results = []
  let created = 0
  let skipped = 0

  for (let i = 0; i < SAMPLE.length; i++) {
    const reg = SAMPLE[i]
    const { name: stageName, id: stageId } = getStage(i)
    const oppName = `${OPP_NAME_PREFIX} ${reg.attendee_name}`

    if (existingNames.has(oppName)) {
      console.log(`  [SKIP] ${oppName} (already exists)`)
      skipped++
      continue
    }

    process.stdout.write(`  [${i+1}/50] ${stageName} | ${reg.attendee_name} (${reg.attendee_email}) ... `)

    try {
      const contactId = await upsertContact(reg)
      await sleep(200)
      const oppId = await createOpp(reg, contactId, stageId, stageName, syncTime)
      console.log(`✓ contact=${contactId} opp=${oppId}`)
      results.push({ idx: i, stageName, regId: reg.id, name: reg.attendee_name, contactId, oppId })
      created++
      await sleep(300)
    } catch (err) {
      console.log(`✗ ERROR: ${err.message}`)
      process.exit(1)
    }
  }

  console.log(`\nDone. Created: ${created}, Skipped: ${skipped}`)
  console.log('\nResults JSON:')
  console.log(JSON.stringify(results, null, 2))
}

main().catch(err => { console.error(err); process.exit(1) })
