import { createClient } from '@/lib/supabase/server'

export async function logIntegrationError(
  orgId: string,
  provider: string,
  operation: string,
  error: Error | string,
  context?: Record<string, unknown>,
): Promise<void> {
  try {
    const supabase = await createClient()
    const message = typeof error === 'string' ? error : error.message
    await supabase.from('integration_errors').insert({
      org_id: orgId,
      provider,
      operation,
      error_message: message,
      context: context ?? {},
    })
  } catch {
    // Don't throw from error logger — just log to console as fallback
    console.error('[integration-error]', { orgId, provider, operation, error })
  }
}
