import { ghlAdapter } from './adapter'

const GHL_BASE = 'https://services.leadconnectorhq.com'
const GHL_VERSION = '2021-07-28'

export async function ghlGet<T>(orgId: string, path: string): Promise<T> {
  const token = await ghlAdapter.getAccessToken(orgId)
  const res = await fetch(`${GHL_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Version: GHL_VERSION },
  })
  if (!res.ok) throw new Error(`GHL GET ${path} failed: ${res.status}`)
  return res.json()
}

export async function ghlPost<T>(orgId: string, path: string, body: object): Promise<T> {
  const token = await ghlAdapter.getAccessToken(orgId)
  const res = await fetch(`${GHL_BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Version: GHL_VERSION },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`GHL POST ${path} failed: ${res.status}`)
  return res.json()
}

export async function ghlPut<T>(orgId: string, path: string, body: object): Promise<T> {
  const token = await ghlAdapter.getAccessToken(orgId)
  const res = await fetch(`${GHL_BASE}${path}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Version: GHL_VERSION },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`GHL PUT ${path} failed: ${res.status}`)
  return res.json()
}
