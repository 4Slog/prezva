export * from './database.generated'
import type { Database } from './database.generated'

// Convenience type exports used by the codebase (hand-written — NOT regenerated)
export type Profile = Database['public']['Tables']['profiles']['Row']
export type Organization = Database['public']['Tables']['organizations']['Row']
export type Event = Database['public']['Tables']['events']['Row']
export type Registration = Database['public']['Tables']['registrations']['Row']
