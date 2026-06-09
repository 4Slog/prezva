const GHL_BASE = process.env.GHL_BASE_URL ?? 'https://services.leadconnectorhq.com'
const GHL_VERSION = process.env.GHL_API_VERSION ?? '2021-07-28'

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Version: GHL_VERSION,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
}

export async function ghlGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${GHL_BASE}${path}`, { headers: headers(token) })
  if (!res.ok) throw new Error(`GHL GET ${path} failed: ${res.status}`)
  return res.json() as Promise<T>
}

export async function ghlPost<T>(token: string, path: string, body: object): Promise<T> {
  const res = await fetch(`${GHL_BASE}${path}`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`GHL POST ${path} failed: ${res.status}`)
  return res.json() as Promise<T>
}

export async function ghlPut<T>(token: string, path: string, body: object): Promise<T> {
  const res = await fetch(`${GHL_BASE}${path}`, {
    method: 'PUT',
    headers: headers(token),
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`GHL PUT ${path} failed: ${res.status}`)
  return res.json() as Promise<T>
}
