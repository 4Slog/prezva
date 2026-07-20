import { createCipheriv, createHash, randomBytes } from 'node:crypto'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { decryptSsoPayload, SsoConfigError } from './sso'

// This suite proves INTERNAL round-trip consistency only: encryptForTest below
// mirrors decryptSsoPayload's exact OpenSSL "Salted__" + EVP_BytesToKey MD5 KDF
// + aes-256-cbc byte math, so a correct round-trip here just proves our own
// encrypt and decrypt agree with each other. It does NOT prove parity with
// GHL's real SSO payloads — that requires the live smoke test (Strand 3),
// run separately against an actual GHL-signed payload.

const TEST_KEY = 'unit-test-shared-secret'

function encryptForTest(plaintext: string, passphrase: string): string {
  const salt = randomBytes(8)
  let derived = Buffer.alloc(0)
  while (derived.length < 48) {
    const hasher = createHash('md5')
    derived = Buffer.concat([
      derived,
      hasher.update(Buffer.concat([
        derived.subarray(-16),
        Buffer.from(passphrase, 'utf-8'),
        salt,
      ])).digest(),
    ])
  }
  const cipher = createCipheriv('aes-256-cbc', derived.subarray(0, 32), derived.subarray(32, 48))
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return Buffer.concat([Buffer.from('Salted__', 'utf-8'), salt, encrypted]).toString('base64')
}

describe('decryptSsoPayload', () => {
  const originalKey = process.env.GHL_APP_SSO_KEY

  beforeEach(() => {
    process.env.GHL_APP_SSO_KEY = TEST_KEY
  })

  afterEach(() => {
    if (originalKey === undefined) delete process.env.GHL_APP_SSO_KEY
    else process.env.GHL_APP_SSO_KEY = originalKey
  })

  it('decrypts a synthetic Salted__ payload and extracts fields via activeLocation', () => {
    const encrypted = encryptForTest(JSON.stringify({
      activeLocation: 'loc_123',
      userId: 'user_1',
      companyId: 'company_1',
      email: 'test@example.com',
      role: 'admin',
      type: 'location',
      userName: 'Test User',
      isAgencyOwner: false,
    }), TEST_KEY)

    const result = decryptSsoPayload(encrypted)

    expect(result.locationId).toBe('loc_123')
    expect(result.userId).toBe('user_1')
    expect(result.companyId).toBe('company_1')
    expect(result.email).toBe('test@example.com')
    expect(result.role).toBe('admin')
    expect(result.type).toBe('location')
    expect(result.userName).toBe('Test User')
    expect(result.isAgencyOwner).toBe(false)
  })

  it('falls back to locationId when activeLocation is absent', () => {
    const encrypted = encryptForTest(JSON.stringify({ locationId: 'loc_456' }), TEST_KEY)
    const result = decryptSsoPayload(encrypted)
    expect(result.locationId).toBe('loc_456')
  })

  it('throws when the decrypted payload has no location id', () => {
    const encrypted = encryptForTest(JSON.stringify({ userId: 'user_1' }), TEST_KEY)
    expect(() => decryptSsoPayload(encrypted)).toThrow('SSO payload missing location id')
  })

  it('throws SsoConfigError when GHL_APP_SSO_KEY is unset', () => {
    delete process.env.GHL_APP_SSO_KEY
    expect(() => decryptSsoPayload('irrelevant')).toThrow(SsoConfigError)
  })

  it('throws when decrypted with the wrong passphrase', () => {
    const encrypted = encryptForTest(JSON.stringify({ activeLocation: 'loc_789' }), 'a-different-secret')
    expect(() => decryptSsoPayload(encrypted)).toThrow()
  })
})
