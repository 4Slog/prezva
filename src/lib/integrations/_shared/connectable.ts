// E-R5: the providers an org can connect today. GoHighLevel connects through
// its own flow (/api/oauth/start → /api/oauth/callback, and the marketplace
// install); Google Drive through /api/integrations/google_drive/auth. Every
// other adapter stays registered (existing rows keep working) but cannot be
// connected until its fixes land (O150).
export const CONNECTABLE_PROVIDERS: ReadonlySet<string> = new Set(['google_drive'])

// The org permission that gates connecting an integration (auth + callback).
export const INTEGRATIONS_PERMISSION = 'org.integrations'

// O151: GHL is disconnected by uninstalling the app in GHL, never from Prezva.
export const GHL_DISCONNECT_REFUSAL =
  'GoHighLevel cannot be disconnected here. Uninstall the Prezva app from your GoHighLevel sub-account instead.'

// O151: one message for "no such row" and "not allowed", so the disconnect
// route cannot be used to probe whether another org has an integration.
export const NOT_FOUND_OR_FORBIDDEN =
  'This integration is not connected, or you do not have permission to manage integrations for this organization.'

export const NOT_CONNECTABLE_MESSAGE = 'This integration is not available yet.'

// Provider-sent ?error= values are never echoed to the user.
export function providerErrorMessage(code: string): string {
  return code === 'access_denied' ? 'Connection cancelled.' : 'The provider could not complete the connection. Please try again.'
}

export function isConnectableProvider(provider: string): boolean {
  return CONNECTABLE_PROVIDERS.has(provider)
}
