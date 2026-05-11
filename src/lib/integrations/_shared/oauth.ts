const TOKEN_ENDPOINTS: Record<string, string> = {
  outlook: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
  teams: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
  zoom: 'https://zoom.us/oauth/token',
  google_drive: 'https://oauth2.googleapis.com/token',
  sharepoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
  mailchimp: 'https://login.mailchimp.com/oauth2/token',
  constant_contact: 'https://authz.constantcontact.com/oauth2/default/v1/token',
  google_forms: 'https://oauth2.googleapis.com/token',
  eventbrite: 'https://www.eventbriteapi.com/v3/oauth/access_token',
  imis: 'https://api.imis.com/api/oauth/token',
  memberclicks: 'https://oauth.memberclicks.net/token',
  yourmembership: 'https://api.yourmembership.com/oauth/token',
  glue_up: 'https://app.glueup.com/oauth/token/',
  neon: 'https://app.neoncrm.com/np/oauth/token',
}

const AUTH_ENDPOINTS: Record<string, string> = {
  outlook: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
  teams: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
  zoom: 'https://zoom.us/oauth/authorize',
  google_drive: 'https://accounts.google.com/o/oauth2/v2/auth',
  sharepoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
  mailchimp: 'https://login.mailchimp.com/oauth2/authorize',
  constant_contact: 'https://authz.constantcontact.com/oauth2/default/v1/authorize',
  google_forms: 'https://accounts.google.com/o/oauth2/v2/auth',
  eventbrite: 'https://www.eventbrite.com/oauth/authorize',
  imis: 'https://api.imis.com/api/oauth/authorize',
  memberclicks: 'https://oauth.memberclicks.net/authorize',
  yourmembership: 'https://api.yourmembership.com/oauth/authorize',
  glue_up: 'https://app.glueup.com/oauth/authorize/',
  neon: 'https://app.neoncrm.com/np/oauth/auth',
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
