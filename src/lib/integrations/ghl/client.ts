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

export async function ghlUpsertContact(
  token: string,
  params: { firstName: string; lastName: string; email: string; phone?: string; locationId: string },
): Promise<string> {
  const res = await fetch(`${GHL_BASE}/contacts/upsert`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const errBody = await res.text()
    throw new Error(`GHL upsert contact failed: ${res.status} — ${errBody}`)
  }
  const data = await res.json() as { contact?: { id?: string }; id?: string }
  const contactId = data.contact?.id ?? (data as Record<string, unknown>).id as string | undefined
  if (!contactId) throw new Error('GHL upsert contact: no contactId in response')
  return contactId
}

export async function ghlAddContactTags(
  token: string,
  contactId: string,
  tags: string[],
): Promise<string[]> {
  if (tags.length === 0) return []
  const res = await fetch(`${GHL_BASE}/contacts/${contactId}/tags`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ tags }),
  })
  if (!res.ok) {
    const errBody = await res.text()
    throw new Error(`GHL add contact tags failed: ${res.status} — ${errBody}`)
  }
  const data = await res.json() as { tags?: string[] }
  return data.tags ?? []
}

export async function ghlSendEmail(
  token: string,
  params: { contactId: string; subject: string; html: string; emailFrom?: string },
): Promise<{ messageId: string; conversationId: string }> {
  const body: Record<string, string> = {
    type: 'Email',
    contactId: params.contactId,
    subject: params.subject,
    html: params.html,
  }
  if (params.emailFrom) body.emailFrom = params.emailFrom
  const res = await fetch(`${GHL_BASE}/conversations/messages`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const errBody = await res.text()
    throw new Error(`GHL send email failed: ${res.status} — ${errBody}`)
  }
  const data = await res.json() as { messageId: string; conversationId: string }
  return { messageId: data.messageId, conversationId: data.conversationId }
}
