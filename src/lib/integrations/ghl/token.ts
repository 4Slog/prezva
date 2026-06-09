// GE-8 TODO: per-org OAuth token resolution — getGhlToken will accept orgId and look up
// the org's stored token from org_integrations. Single-location PIT for now.
export function getGhlToken(): string {
  const token = process.env.GHL_API_TOKEN
  if (!token) throw new Error('GHL_API_TOKEN is not set')
  return token
}
