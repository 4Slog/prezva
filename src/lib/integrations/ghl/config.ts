export function isGhlEventsEnabled(): boolean {
  return process.env.GHL_EVENTS_ENABLED === 'true'
}
