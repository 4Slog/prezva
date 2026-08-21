import { verify, createPublicKey } from 'node:crypto'

// GHL Marketplace app webhooks are Ed25519-signed by GHL itself — there is no
// shared secret to provision, rotate, or leak. The signature is base64 in the
// x-ghl-signature header and covers the RAW request body bytes, so the caller
// must hand us the exact string it read off the wire: re-serializing a parsed
// object (key order, whitespace, unicode escaping) produces different bytes and
// fails verification even when the payload is semantically identical.
//
// The legacy x-wh-signature header is NEVER honored. It is a different, weaker
// scheme, and accepting either would let a caller choose the one they can
// forge — the classic downgrade.
export const GHL_APP_WEBHOOK_SIGNATURE_HEADER = 'x-ghl-signature'

// GHL's published Ed25519 public key. Public, non-secret, and identical for
// every marketplace app, so it is pinned as a constant rather than required as
// env config — that way every environment (preview, local, CI) verifies
// correctly with zero setup, and a missing env var can never silently disable
// verification. The env override exists only so a key roll can be deployed
// without a code change, mirroring the GHL_BASE_URL / GHL_API_VERSION
// convention in integrations/ghl/client.ts.
const PINNED_PUBLIC_KEY_PEM = [
  '-----BEGIN PUBLIC KEY-----',
  'MCowBQYDK2VwAyEAi2HR1srL4o18O8BRa7gVJY7G7bupbN3H9AwJrHCDiOg=',
  '-----END PUBLIC KEY-----',
].join('\n')

function resolvePublicKeyPem(): string {
  const override = process.env.GHL_WEBHOOK_PUBLIC_KEY
  return override && override.trim() ? override : PINNED_PUBLIC_KEY_PEM
}

// Returns false — never throws — for every rejection path: absent header,
// non-base64 garbage, wrong length, an unparseable key, or a valid-but-wrong
// signature. A verification failure is an expected condition on a public
// endpoint, not an exceptional one, and the caller answers all of them
// identically with a 401.
export function verifyGhlAppSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false

  const trimmed = signatureHeader.trim()
  if (!trimmed) return false

  try {
    const signature = Buffer.from(trimmed, 'base64')
    // Ed25519 signatures are exactly 64 bytes. Buffer.from(..., 'base64') is
    // lenient — it silently drops invalid characters rather than failing — so
    // this length check is what actually rejects malformed input.
    if (signature.length !== 64) return false

    const key = createPublicKey(resolvePublicKeyPem())

    // Algorithm is null for Ed25519: the scheme fixes its own hash (SHA-512
    // internally), so passing a digest name here would throw.
    return verify(null, Buffer.from(rawBody, 'utf8'), key, signature)
  } catch {
    return false
  }
}
