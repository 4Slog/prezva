// O125: only a real network failure sends a scanner to the device path. A
// server action that cannot reach the server rejects with a TypeError (fetch's
// "Failed to fetch" / "Load failed"); a browser that knows it is offline says so.
// Anything else thrown came back FROM the server and is shown as a refusal.
export function isNetworkFailure(error: unknown): boolean {
  if (error instanceof TypeError) return true
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

export function thrownMessage(error: unknown, fallback = 'Check-in failed'): string {
  return error instanceof Error && error.message ? error.message : fallback
}
