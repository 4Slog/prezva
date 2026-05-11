export type IntegrationStatus = 'awaiting_credentials' | 'available' | 'connected' | 'error'

export interface IntegrationAdapter {
  readonly provider: string
  readonly displayName: string
  isConfigured(): boolean
  getAuthUrl(orgId: string, redirectUri: string, state: string): string
  handleCallback(code: string, orgId: string, redirectUri: string): Promise<void>
  disconnect(orgId: string): Promise<void>
  getStatus(orgId: string): Promise<IntegrationStatus>
}
