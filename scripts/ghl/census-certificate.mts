/**
 * Census instrument 2 — the certificate template artifact for one org.
 *
 * The certificate template rides the same snapshot the workflows do, and until
 * today it carried a client's event name hardcoded into it. No workflow census
 * would ever have caught that, because the workflow roster says nothing about
 * what is printed on the certificate.
 *
 * READ-ONLY PATH ONLY. Never open a certificate template in the GHL editor to
 * inspect it: opening the editor rewrites the stored artifact even when nothing
 * is saved, so "looking" is a mutation. The sanctioned read is the public
 * template endpoint (no auth) -> downloadUrl -> the GCS artifact fetched
 * directly. This script does exactly that and nothing else.
 *
 * There is NO list endpoint for certificate templates — five candidate paths
 * were probed and all returned 404 against a working control — so the template
 * id has to be passed in. It cannot be discovered from the API.
 *
 * THE CHECK IS POSITIVE, NOT A BLACKLIST. It does not grep for known-bad
 * strings. A pattern that enumerates the bad values we already know about
 * cannot discover the one we have never seen, and discovering that one is the
 * entire point. So every text block must prove itself to be EITHER a merge
 * token OR an exact member of STATIC_PHRASES; anything else is a failure and is
 * printed verbatim.
 *
 * Run: pnpm tsx --env-file=.env.local scripts/ghl/census-certificate.mts <orgId> <templateId>
 *
 * Exit codes: 0 = artifact clean, 1 = usage/link/fetch failure or any assertion
 * failure.
 */
import { createHash } from 'node:crypto'
import { createAdminClient } from '../../src/lib/supabase/admin'

// The only literal text allowed to appear on a certificate. Everything else has
// to be a merge token. Adding a phrase here is a deliberate, reviewable act —
// which is the property a blacklist does not have.
const STATIC_PHRASES = [
  'Certificate of Completion',
  'This certifies that',
  'has successfully completed',
] as const

// Plain braces, no spaces, lowercase namespace and key. GHL will happily store
// `{{ contact.name }}` or `{{Contact.Name}}`, neither of which merges — so the
// shape is asserted exactly, not loosely.
const TOKEN_RE = /^\{\{[a-z]+\.[a-z_]+\}\}$/

// Tokens the certificate is useless without. R59 writes these two contact
// fields at issue time; if the template stops merging them the certificate goes
// out blank rather than wrong, which is quieter and worse.
const REQUIRED_TOKENS = ['contact.prezva_event_name', 'contact.prezva_completion_date']

// Remnants of the QR era. These are counted, not searched for as evidence of
// badness in the text — they are structural leftovers that live outside the
// text blocks, so the positive text check cannot see them.
const QR_PATTERNS = [
  'clip-path-dot-color',
  'clip-path-corners-square-color',
  'clip-path-corners-dot-color',
  'data-ghl-qr',
  'qr-marker',
  'my-certificates.com',
]

interface TextBlock {
  text: string
  x: string
  width: string
  fontSize: string
}

const orgId = process.argv[2]
const templateId = process.argv[3]
if (!orgId || !templateId) {
  console.error('usage: census-certificate.mts <orgId> <templateId>')
  process.exit(1)
}

const admin = createAdminClient()
const { data: link } = await admin
  .from('ghl_location_links')
  .select('ghl_location_id')
  .eq('org_id', orgId)
  .maybeSingle()

const locationId = link?.ghl_location_id as string | undefined
if (!locationId) {
  console.error(`CERT ${orgId} NO_LOCATION_LINK`)
  process.exit(1)
}

// The public template endpoint takes no auth — deliberately, so this census
// works on a location whose OAuth token has lapsed.
const metaRes = await fetch(
  `https://services.leadconnectorhq.com/certificates/templates/public/${encodeURIComponent(templateId)}`,
  { headers: { Version: '2021-07-28', Accept: 'application/json' } },
)
if (!metaRes.ok) {
  console.error(`CERT ${orgId} TEMPLATE_FETCH_FAILED ${metaRes.status} ${await metaRes.text()}`)
  process.exit(1)
}
const meta = (await metaRes.json()) as { downloadUrl?: string; title?: string; error?: boolean }
const downloadUrl = meta.downloadUrl
if (!downloadUrl) {
  console.error(`CERT ${orgId} NO_DOWNLOAD_URL ${JSON.stringify(meta)}`)
  process.exit(1)
}

const artRes = await fetch(downloadUrl)
if (!artRes.ok) {
  console.error(`CERT ${orgId} ARTIFACT_FETCH_FAILED ${artRes.status}`)
  process.exit(1)
}
const bytes = Buffer.from(await artRes.arrayBuffer())
const artifact = bytes.toString('utf8')
const sha256 = createHash('sha256').update(bytes).digest('hex')

console.log(`CERT org=${orgId} location=${locationId} template=${templateId}`)
console.log(`TITLE ${meta.title ?? '(untitled)'}`)
console.log(`BYTES ${bytes.length}`)
console.log(`SHA256 ${sha256}`)

const failures: string[] = []

// The GCS object path is namespaced by location. Asserting it means a template
// id copied from the wrong tenant fails loudly instead of quietly reporting a
// clean bill of health for a certificate this org does not own.
if (!downloadUrl.includes(`/${locationId}/`)) {
  failures.push(`DOWNLOAD_URL_LOCATION_MISMATCH expected ${locationId} in ${downloadUrl}`)
}
console.log(`DOWNLOAD_URL_LOCATION ${downloadUrl.includes(`/${locationId}/`) ? 'ok' : 'MISMATCH'}`)

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
}

// Text blocks are <foreignObject> elements inside a <g transform="matrix(...)">.
const BLOCK_RE =
  /<g transform="matrix\([^)]*\)"><foreignObject x="([^"]*)" y="[^"]*" width="([^"]*)"[^>]*>([\s\S]*?)<\/foreignObject><\/g>/g

const blocks: TextBlock[] = []
let match: RegExpExecArray | null
while ((match = BLOCK_RE.exec(artifact)) !== null) {
  const [, x, width, inner] = match
  const fontSize = /font-size:\s*([^;]+);/.exec(inner)?.[1]?.trim() ?? '?'
  const text = /<div\b[^>]*>([\s\S]*?)<\/div>/.exec(inner)?.[1]
  if (text === undefined) {
    failures.push(`UNPARSED_BLOCK x=${x} width=${width} — no <div> text found`)
    continue
  }
  blocks.push({ text: decodeEntities(text).trim(), x, width, fontSize })
}

// If the document holds more <foreignObject> elements than we parsed, the
// positive check has a blind spot — and a hardcoded value hiding in the gap
// would read as a pass. Fail instead of reporting on a subset.
const foreignObjectCount = (artifact.match(/<foreignObject\b/g) ?? []).length
if (foreignObjectCount !== blocks.length) {
  failures.push(
    `BLOCK_PARSE_INCOMPLETE parsed=${blocks.length} foreignObjects=${foreignObjectCount}`,
  )
}

// Every block is printed, every run — the GHL editor silently auto-resizes a
// block when its text changes, so a diff limited to the blocks we meant to
// touch would miss the collateral edits it makes to the ones we did not.
console.log(`\nBLOCKS ${blocks.length}`)
console.log('#   font-size  x               width           text')
blocks.forEach((b, i) => {
  console.log(
    `${String(i).padStart(2)}  ${b.fontSize.padEnd(9)}  ${b.x.padEnd(14)}  ${b.width.padEnd(14)}  ${JSON.stringify(b.text)}`,
  )
})

const tokens: string[] = []
console.log('')
for (const b of blocks) {
  if (TOKEN_RE.test(b.text)) {
    tokens.push(b.text.slice(2, -2))
    continue
  }
  if ((STATIC_PHRASES as readonly string[]).includes(b.text)) continue
  console.log(`HARDCODED ${JSON.stringify(b.text)}  (x=${b.x} width=${b.width} font-size=${b.fontSize})`)
  failures.push(`HARDCODED ${JSON.stringify(b.text)}`)
}

console.log(`TOKENS ${tokens.length} ${tokens.join(', ')}`)
for (const required of REQUIRED_TOKENS) {
  const present = tokens.includes(required)
  console.log(`REQUIRED_TOKEN ${required} ${present ? 'present' : 'MISSING'}`)
  if (!present) failures.push(`MISSING_TOKEN ${required}`)
}

console.log('')
for (const pattern of QR_PATTERNS) {
  const count = artifact.split(pattern).length - 1
  console.log(`QR ${pattern} ${count}`)
  if (count !== 0) failures.push(`QR_REMNANT ${pattern} x${count}`)
}

if (failures.length > 0) {
  console.error(`\nCERT ${orgId} FAIL — ${failures.length} failure(s)`)
  for (const f of failures) console.error(`  ${f}`)
  process.exit(1)
}

console.log(`\nCERT ${orgId} PASS`)
