import { schemaTask } from '@trigger.dev/sdk'
import { z } from 'zod'
import { createAdminClient } from '../lib/supabase-admin'
import { ghlUpsertContact, ghlSendEmail } from '@/lib/integrations/ghl/client'
import { ghlAdapter } from '@/lib/integrations/ghl/adapter'
import { ghlLocationIdForOrg } from '@/lib/integrations/ghl/location'

export const ghlSpeakerMessageTask = schemaTask({
  id: 'ghl-speaker-message',
  schema: z.object({
    speakerId: z.string(),
    eventId:   z.string(),
    orgId:     z.string(),
    subject:   z.string(),
    html:      z.string(),
  }),
  run: async (payload) => {
    const admin = createAdminClient()
    const token = await ghlAdapter.getAccessToken(payload.orgId)
    if (!token) throw new Error(`No GHL access token available for org ${payload.orgId}`)

    const locationId = await ghlLocationIdForOrg(admin, payload.orgId)
    if (!locationId) throw new Error(`No GHL location linked for org ${payload.orgId}`)

    const { data: speaker, error } = await admin
      .from('speakers')
      .select('id, name, email, ghl_contact_id')
      .eq('id', payload.speakerId)
      .single()
    if (error || !speaker) throw new Error(`Speaker ${payload.speakerId} not found`)
    if (!speaker.email) throw new Error(`Speaker ${payload.speakerId} has no email`)

    const spaceIdx = (speaker.name as string).indexOf(' ')
    const firstName = spaceIdx === -1 ? (speaker.name as string) : (speaker.name as string).slice(0, spaceIdx)
    const lastName  = spaceIdx === -1 ? '' : (speaker.name as string).slice(spaceIdx + 1)

    let contactId: string = speaker.ghl_contact_id as string
    if (!contactId) {
      contactId = await ghlUpsertContact(token, {
        firstName,
        lastName,
        email: speaker.email as string,
        locationId,
      })
      await admin
        .from('speakers')
        .update({ ghl_contact_id: contactId })
        .eq('id', payload.speakerId)
    }

    const result = await ghlSendEmail(token, {
      contactId,
      subject: payload.subject,
      html: payload.html,
    })

    console.log(`[ghl-speaker-message] sent speakerId=${payload.speakerId} messageId=${result.messageId}`)
    return result
  },
})
