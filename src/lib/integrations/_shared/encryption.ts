import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

function getKey(): Buffer | null {
  const key = process.env.INTEGRATION_ENCRYPTION_KEY
  if (!key) return null
  const buf = Buffer.from(key, 'base64')
  if (buf.length < 32) return null
  return buf.subarray(0, 32)
}

export function validateEncryptionKey(): void {
  const key = getKey()
  if (!key) {
    throw new Error('INTEGRATION_ENCRYPTION_KEY must decode to >= 32 bytes')
  }
}

export function encryptToken(plaintext: string): string | null {
  const key = getKey()
  if (!key) {
    console.warn('encryptToken: INTEGRATION_ENCRYPTION_KEY not set — storing null')
    return null
  }
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join(':')
}

export function decryptToken(stored: string): string | null {
  const key = getKey()
  if (!key) return null
  try {
    const [ivB64, authTagB64, dataB64] = stored.split(':')
    const iv = Buffer.from(ivB64, 'base64')
    const authTag = Buffer.from(authTagB64, 'base64')
    const data = Buffer.from(dataB64, 'base64')
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(authTag)
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}
