import type { IntegrationAdapter } from './adapter'
import { outlookAdapter } from '../outlook/adapter'
import { zoomAdapter } from '../zoom/adapter'
import { teamsAdapter } from '../teams/adapter'

const registry = new Map<string, IntegrationAdapter>([
  ['outlook', outlookAdapter],
  ['zoom', zoomAdapter],
  ['teams', teamsAdapter],
])

export function getAdapter(provider: string): IntegrationAdapter {
  const adapter = registry.get(provider)
  if (!adapter) throw new Error(`Unknown integration provider: ${provider}`)
  return adapter
}

export function listAdapters(): IntegrationAdapter[] {
  return Array.from(registry.values())
}
