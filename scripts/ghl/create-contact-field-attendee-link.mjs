/**
 * Create (or verify) the "Prezva Attendee Link" GHL contact custom field.
 * Idempotent: fetches existing contact custom fields first; exits without
 * creating a duplicate if the field already exists.
 * Run: node scripts/ghl/create-contact-field-attendee-link.mjs
 */

import fs from 'fs'
import path from 'path'

// Load .env.local manually (mirrors seed-saup-golden-dataset.mjs)
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

const GHL_BASE    = process.env.GHL_BASE_URL ?? 'https://services.leadconnectorhq.com'
const GHL_VERSION = '2021-07-28'
const LOC_ID      = '4KrDX2FYA2XZ68q88rFS'
const FIELD_NAME  = 'Prezva Attendee Link'

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

async function main() {
  console.log(`\nGHL Contact Field Setup — location ${LOC_ID}`)
  console.log(`Looking for existing field: "${FIELD_NAME}"\n`)

  // 1. GET existing contact custom fields for this location
  const getRes = await fetch(
    `${GHL_BASE}/locations/${LOC_ID}/customFields?model=contact`,
    { headers: ghlHeaders() },
  )
  if (!getRes.ok) {
    const err = await getRes.text()
    console.error(`GET /customFields failed ${getRes.status}: ${err}`)
    process.exit(1)
  }
  const getData = await getRes.json()
  const fields = getData.customFields ?? getData.fields ?? []

  // 2. Check for existing field with the exact target name
  const existing = fields.find(f => f.name === FIELD_NAME)
  if (existing) {
    console.log('Field already exists — skipping creation (idempotent).\n')
    console.log('Full existing field JSON:')
    console.log(JSON.stringify(existing, null, 2))
    console.log(`\nFIELD_ID=${existing.id}  FIELD_KEY=${existing.fieldKey ?? existing.key ?? '(none)'}  DATATYPE=${existing.dataType ?? existing.type}  MODEL=${existing.model ?? 'contact'}`)
    return
  }

  console.log(`Field not found. Creating "${FIELD_NAME}"...\n`)

  // 3. POST to create the new field
  const postBody = {
    name:     FIELD_NAME,
    dataType: 'TEXT',
    model:    'contact',
  }
  const postRes = await fetch(
    `${GHL_BASE}/locations/${LOC_ID}/customFields`,
    {
      method: 'POST',
      headers: ghlHeaders(),
      body: JSON.stringify(postBody),
    },
  )

  const postText = await postRes.text()

  if (!postRes.ok) {
    console.error(`POST /customFields FAILED ${postRes.status}:`)
    console.error(postText)
    process.exit(1)
  }

  let postData
  try {
    postData = JSON.parse(postText)
  } catch {
    console.error('Could not parse POST response as JSON:')
    console.error(postText)
    process.exit(1)
  }

  const created = postData.customField ?? postData.field ?? postData
  console.log('Full POST response JSON:')
  console.log(JSON.stringify(postData, null, 2))
  console.log(`\nFIELD_ID=${created.id}  FIELD_KEY=${created.fieldKey ?? created.key ?? '(none)'}  DATATYPE=${created.dataType ?? created.type}  MODEL=${created.model ?? 'contact'}`)
}

main().catch(err => { console.error(err); process.exit(1) })
