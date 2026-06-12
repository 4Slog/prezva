import { getGhlToken } from '../src/lib/integrations/ghl/token'

const GHL_BASE = 'https://services.leadconnectorhq.com'
const LOCATION_ID = '4KrDX2FYA2XZ68q88rFS'

function buildHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Version: '2021-07-28',
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
}

async function main() {
  const token = getGhlToken()
  const headers = buildHeaders(token)

  // ── Step A: upsert contact ────────────────────────────────────────────────
  console.log('\n=== STEP A: POST /contacts/upsert ===')
  const upsertBody = {
    firstName: 'Prezva',
    lastName: 'Probe',
    email: 'prezva-probe@example.com',
    locationId: LOCATION_ID,
  }
  const upsertRes = await fetch(`${GHL_BASE}/contacts/upsert`, {
    method: 'POST',
    headers,
    body: JSON.stringify(upsertBody),
  })
  const upsertText = await upsertRes.text()
  console.log(`status: ${upsertRes.status}`)
  console.log(`body: ${upsertText}`)

  let contactId: string | null = null
  try {
    const parsed = JSON.parse(upsertText)
    contactId = parsed?.contact?.id ?? parsed?.id ?? null
  } catch {
    // non-JSON body, contactId stays null
  }

  // ── Step B: send email (only if we have a contactId) ─────────────────────
  let sendStatus: number | null = null
  let sendText: string | null = null
  let messageId: string | null = null

  if (contactId) {
    console.log('\n=== STEP B: POST /conversations/messages ===')
    const sendBody = {
      type: 'Email',
      contactId,
      subject: 'Prezva GHL comms probe',
      html: '<p>probe</p>',
    }
    const sendRes = await fetch(`${GHL_BASE}/conversations/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify(sendBody),
    })
    sendText = await sendRes.text()
    sendStatus = sendRes.status
    console.log(`status: ${sendRes.status}`)
    console.log(`body: ${sendText}`)

    try {
      const parsed = JSON.parse(sendText)
      messageId = parsed?.messageId ?? parsed?.emailMessageId ?? null
    } catch {
      // non-JSON body
    }
  } else {
    console.log('\n=== STEP B: SKIPPED (no contactId from Step A) ===')
  }

  // ── Step C: summary ───────────────────────────────────────────────────────
  console.log('\n=== SUMMARY ===')
  console.log(`UPSERT: ${upsertRes.status} — contactId=${contactId ?? 'NONE'}`)
  console.log(`SEND:   ${sendStatus ?? 'SKIPPED'} — messageId=${messageId ?? 'NONE'}`)

  const upsertOk = upsertRes.status >= 200 && upsertRes.status < 300 && contactId !== null
  const sendOk   = sendStatus !== null && sendStatus >= 200 && sendStatus < 300 && messageId !== null

  if (upsertOk && sendOk) {
    console.log('VERDICT: GREEN — both succeeded, token has contacts.write + conversations/message.write')
  } else if (!upsertOk && (upsertRes.status === 401 || upsertRes.status === 403)) {
    console.log(`VERDICT: SCOPE-BLOCKED — upsert returned ${upsertRes.status}; body indicates scope/auth issue`)
  } else if (sendStatus !== null && !sendOk && (sendStatus === 401 || sendStatus === 403)) {
    console.log(`VERDICT: SCOPE-BLOCKED — send returned ${sendStatus}; body indicates scope/auth issue`)
  } else if (!upsertOk) {
    console.log(`VERDICT: OTHER — upsert returned ${upsertRes.status}; body: ${upsertText?.slice(0, 300)}`)
  } else {
    console.log(`VERDICT: OTHER — send returned ${sendStatus}; body: ${sendText?.slice(0, 300)}`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
