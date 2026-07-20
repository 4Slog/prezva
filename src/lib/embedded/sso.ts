import { createDecipheriv, createHash } from 'node:crypto'

// GHL Custom Page SSO decrypt (GE-8 batch 4). Mirrors GoHighLevel's official
// marketplace app template byte-for-byte (GHL.decryptSSOData in
// github.com/GoHighLevel/ghl-marketplace-app-template, src/ghl.ts): OpenSSL
// "Salted__" envelope — the 8-byte magic is skipped positionally, not
// validated, exactly as GHL's own template does — EVP_BytesToKey MD5 key/IV
// derivation, aes-256-cbc. Do not "clean up" this byte math without
// re-verifying against a live GHL payload (see decryptSsoPayload.test.ts
// header for what that test does and does not prove).

const BLOCK_SIZE = 16
const KEY_SIZE = 32
const IV_SIZE = 16
const SALT_SIZE = 8

export class SsoConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SsoConfigError'
  }
}

export interface SsoUserContext {
  locationId: string
  userId?: string
  companyId?: string
  email?: string
  role?: string
  type?: string
  userName?: string
  isAgencyOwner?: boolean
  versionId?: string
  appStatus?: string
}

interface RawSsoPayload {
  activeLocation?: string
  locationId?: string
  userId?: string
  companyId?: string
  email?: string
  role?: string
  type?: string
  userName?: string
  isAgencyOwner?: boolean
  versionId?: string
  appStatus?: string
}

export function decryptSsoPayload(encrypted: string): SsoUserContext {
  const passphrase = process.env.GHL_APP_SSO_KEY
  if (!passphrase) throw new SsoConfigError('GHL_APP_SSO_KEY is not set')

  const raw = Buffer.from(encrypted, 'base64')
  const salt = raw.subarray(SALT_SIZE, BLOCK_SIZE)
  const cipherText = raw.subarray(BLOCK_SIZE)

  let derived = Buffer.alloc(0)
  while (derived.length < KEY_SIZE + IV_SIZE) {
    const hasher = createHash('md5')
    derived = Buffer.concat([
      derived,
      hasher.update(Buffer.concat([
        derived.subarray(-IV_SIZE),
        Buffer.from(passphrase, 'utf-8'),
        salt,
      ])).digest(),
    ])
  }

  const decipher = createDecipheriv(
    'aes-256-cbc',
    derived.subarray(0, KEY_SIZE),
    derived.subarray(KEY_SIZE, KEY_SIZE + IV_SIZE),
  )
  const decrypted = Buffer.concat([decipher.update(cipherText), decipher.final()])
  const payload = JSON.parse(decrypted.toString('utf-8')) as RawSsoPayload

  // Location id field name is not stable across GHL docs/examples — read defensively.
  const locationId = payload.activeLocation ?? payload.locationId
  if (!locationId) throw new Error('SSO payload missing location id')

  return {
    locationId,
    userId: payload.userId,
    companyId: payload.companyId,
    email: payload.email,
    role: payload.role,
    type: payload.type,
    userName: payload.userName,
    isAgencyOwner: payload.isAgencyOwner,
    versionId: payload.versionId,
    appStatus: payload.appStatus,
  }
}
