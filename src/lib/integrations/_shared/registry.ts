import type { IntegrationAdapter } from './adapter'
import { outlookAdapter } from '../outlook/adapter'
import { zoomAdapter } from '../zoom/adapter'
import { teamsAdapter } from '../teams/adapter'
import { googleDriveAdapter } from '../google-drive/adapter'
import { sharePointAdapter } from '../sharepoint/adapter'
import { mailchimpAdapter } from '../mailchimp/adapter'
import { constantContactAdapter } from '../constant-contact/adapter'
import { googleFormsAdapter } from '../google-forms/adapter'
import { eventbriteAdapter } from '../eventbrite/adapter'

const registry = new Map<string, IntegrationAdapter>([
  ['outlook', outlookAdapter],
  ['zoom', zoomAdapter],
  ['teams', teamsAdapter],
  ['google_drive', googleDriveAdapter],
  ['sharepoint', sharePointAdapter],
  ['mailchimp', mailchimpAdapter],
  ['constant_contact', constantContactAdapter],
  ['google_forms', googleFormsAdapter],
  ['eventbrite', eventbriteAdapter],
])

export function getAdapter(provider: string): IntegrationAdapter {
  const adapter = registry.get(provider)
  if (!adapter) throw new Error(`Unknown integration provider: ${provider}`)
  return adapter
}

export function listAdapters(): IntegrationAdapter[] {
  return Array.from(registry.values())
}
