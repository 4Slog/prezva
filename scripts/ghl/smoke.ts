import { getGhlToken } from '../../src/lib/integrations/ghl/token'
import { ghlGet } from '../../src/lib/integrations/ghl/client'

async function main() {
  const locationId = process.env.GHL_LOCATION_ID
  if (!locationId) throw new Error('GHL_LOCATION_ID is not set')

  const token = getGhlToken()
  const data = await ghlGet<{ location: { id: string; name: string } }>(token, `/locations/${locationId}`)

  console.log('id:', data.location.id)
  console.log('name:', data.location.name)
}

main().catch((e) => { console.error(e); process.exit(1) })
