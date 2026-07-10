import type { SupabaseClient } from '@supabase/supabase-js'
import { ghlUpsertContact, ghlSendEmail } from '@/lib/integrations/ghl/client'
import { getGhlToken } from '@/lib/integrations/ghl/token'
import { ghlLocationIdForOrg } from '@/lib/integrations/ghl/location'

export async function sendSpeakerEmail(args: {
  admin: SupabaseClient
  orgId: string
  speaker: { id: string; name: string; email: string; ghlContactId?: string | null }
  subject: string
  html: string
  text?: string
  resend: { from: string; replyTo?: string }
}): Promise<{ via: 'ghl' | 'resend'; contactId?: string }> {
  const { admin, orgId, speaker, subject, html, text, resend } = args
  if (!speaker.email) throw new Error(`Speaker ${speaker.id} has no email`)

  const locationId = await ghlLocationIdForOrg(admin, orgId)

  if (locationId) {
    const token = getGhlToken()

    const spaceIdx = speaker.name.indexOf(' ')
    const firstName = spaceIdx === -1 ? speaker.name : speaker.name.slice(0, spaceIdx)
    const lastName = spaceIdx === -1 ? '' : speaker.name.slice(spaceIdx + 1)

    let contactId = speaker.ghlContactId
    if (!contactId) {
      contactId = await ghlUpsertContact(token, {
        firstName,
        lastName,
        email: speaker.email,
        locationId,
      })
      await admin
        .from('speakers')
        .update({ ghl_contact_id: contactId })
        .eq('id', speaker.id)
    }

    await ghlSendEmail(token, { contactId, subject, html })

    return { via: 'ghl', contactId }
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: resend.from,
      to: speaker.email,
      subject,
      html,
      text,
      reply_to: resend.replyTo || undefined,
    }),
  })

  if (!res.ok) {
    const errBody = await res.text()
    throw new Error(`Resend failed (${res.status}): ${errBody}`)
  }

  return { via: 'resend' }
}
