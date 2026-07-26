// @supabase/realtime-js >= 2.106 requires a global WebSocket, which the
// Trigger.dev runtime (Node 21) does not provide. None of our server-side
// Supabase clients (app-side admin, service, or trigger admin) use Realtime —
// only browser clients (@/lib/supabase/client) open channels. This stub
// satisfies the constructor's type check without adding a `ws` dependency
// or pinning the runtime.
export class NoopWebSocket {
  constructor(_address: string | URL, _subprotocols?: string | string[]) {}
}
