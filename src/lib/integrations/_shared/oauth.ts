const TOKEN_ENDPOINTS: Record<string, string> = {
  outlook: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
  teams: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
  zoom: 'https://zoom.us/oauth/token',
}

const AUTH_ENDPOINTS: Record<string, string> = {
  outlook: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
  teams: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
  zoom: 'https://zoom.us/oauth/authorize',
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  token_type?: string
}

export function getAuthUrl(provider: string, clientId: string, redirectUri: string, scopes: string[], state: string): string {
  const base = AUTH_ENDPOINTS[provider]
  if (!base) throw new Error(`Unknown provider: ${provider}`)
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: scopes.join(' '),
    state,
  })
  if (provider === 'outlook' || provider === 'teams') {
    params.set('response_mode', 'query')
  }
  return `${base}?${params}`
}

export async function exchangeCodeForTokens(provider: string, code: string, redirectUri: string, clientId: string, clientSecret: string): Promise<TokenResponse> {
  const endpoint = TOKEN_ENDPOINTS[provider]
  if (!endpoint) throw new Error(`Unknown provider: ${provider}`)

  const body: Record<string, string> = {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Token exchange failed: ${err}`)
  }

  return res.json()
}

export async function refreshAccessToken(provider: string, refreshToken: string, clientId: string, clientSecret: string): Promise<string> {
  const endpoint = TOKEN_ENDPOINTS[provider]
  if (!endpoint) throw new Error(`Unknown provider: ${provider}`)

  const body: Record<string, string> = {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Token refresh failed: ${err}`)
  }

  const data = await res.json()
  return data.access_token
}
