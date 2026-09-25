import type { SupabaseClient } from '@supabase/supabase-js'

// The name other participants see in a LiveKit room or a video-chat request.
// profiles.full_name only (profiles has no display_name column — asking for it
// failed the whole read, so every caller fell back to the user's email). The
// fallback is a neutral label, never the email or the user id.
export const VIDEO_FALLBACK_NAME = 'Attendee'

export async function videoDisplayName(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data, error } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', userId)
    .maybeSingle()
  if (error) console.error('[video] display name read failed', error.message)
  const name = (data as { full_name?: string | null } | null)?.full_name?.trim()
  return name ? name.slice(0, 100) : VIDEO_FALLBACK_NAME
}
