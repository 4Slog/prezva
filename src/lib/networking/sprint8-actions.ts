'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/get-user'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { z } from 'zod'

// ─── T-091, T-091a, T-094e: Attendee profiles ────────────────────────────────

const ProfileSchema = z.object({
  bio: z.string().max(1000).optional(),
  company: z.string().max(200).optional(),
  job_title: z.string().max(200).optional(),
  interests: z.array(z.string()).optional(),
  avatar_url: z.string().url().optional().or(z.literal('')),
  linkedin_url: z.string().url().optional().or(z.literal('')),
  twitter_url: z.string().url().optional().or(z.literal('')),
  website_url: z.string().url().optional().or(z.literal('')),
  is_visible: z.boolean().optional(),
  share_email: z.boolean().optional(),
})

export async function upsertAttendeeProfile(registrationId: string, raw: unknown) {
  const supabase = await createClient()
  const data = ProfileSchema.parse(raw)

  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    // ── Logged-in user path ──────────────────────────────────────────────────
    const { data: reg } = await supabase
      .from('registrations')
      .select('id, event_id, user_id, attendee_email')
      .eq('id', registrationId)
      .single()
    const emailVerified = !!user.email_confirmed_at
    const ownsReg =
      !!reg &&
      (reg.user_id === user.id ||
        (reg.user_id == null &&
          emailVerified &&
          !!user.email &&
          (reg.attendee_email ?? '').toLowerCase() === user.email.toLowerCase()))
    if (!ownsReg) return { error: 'Not authorized' }

    const admin = createAdminClient()
    const { error } = await admin
      .from('attendee_profiles')
      .upsert({
        registration_id: registrationId,
        event_id: (reg as any).event_id,
        user_id: user.id,
        ...data,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'registration_id' })

    if (error) return { error: error.message }

    const { awardPoints } = await import('@/lib/engagement/sprint10-actions')
    await awardPoints((reg as any).event_id, user.id, 'profile_complete').catch(() => {})

    revalidatePath('/e')
    return { success: true }
  } else {
    // ── Guest (cookie-only) path ─────────────────────────────────────────────
    const admin = createAdminClient()
    const { data: reg } = await admin
      .from('registrations')
      .select('id, event_id, events(slug)')
      .eq('id', registrationId)
      .single()
    if (!reg) return { error: 'Registration not found' }

    const slug = (reg as any).events?.slug as string | undefined
    if (!slug) return { error: 'Event not found' }

    const jar = await cookies()
    const cookieVal = jar.get(`pz_reg_${slug}`)?.value
    if (!cookieVal || cookieVal !== registrationId) return { error: 'Not authorized' }

    const { error } = await admin
      .from('attendee_profiles')
      .upsert({
        registration_id: registrationId,
        event_id: (reg as any).event_id,
        user_id: null,
        ...data,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'registration_id' })

    if (error) return { error: error.message }

    revalidatePath('/e')
    return { success: true }
  }
}

export async function getAttendeeProfile(registrationId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('attendee_profiles')
    .select('*')
    .eq('registration_id', registrationId)
    .single()
  return data
}

export async function getMyProfile(eventId: string) {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: reg } = await supabase
    .from('registrations')
    .select('id')
    .eq('event_id', eventId)
    .eq('attendee_email', (await supabase.auth.getUser()).data.user?.email ?? '')
    .neq('status', 'cancelled')
    .single()

  if (!reg) return null

  const { data } = await supabase
    .from('attendee_profiles')
    .select('*')
    .eq('registration_id', (reg as any).id)
    .single()

  return { profile: data, registrationId: (reg as any).id }
}

// T-091: SmartProfiles search — reads event_visible_profiles (SECURITY DEFINER view, enforces is_visible + is_registered)
export async function searchAttendeeProfiles(eventId: string, query: string, page = 0) {
  const supabase = await createClient()
  const PAGE_SIZE = 20

  let q = supabase
    .from('event_visible_profiles')
    .select('id, registration_id, attendee_name, handle, company, job_title, bio, interests, avatar_url, ticket_name')
    .eq('event_id', eventId)
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

  if (query.trim()) {
    const safe = query.trim().replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_').replace(/[,()]/g, '')
    const term = `%${safe}%`
    q = q.or(`bio.ilike.${term},company.ilike.${term},job_title.ilike.${term}`)
  } else {
    q = q.order('created_at', { ascending: true })
  }

  const { data } = await q
  return ((data ?? []) as any[]).map(p => ({
    id: p.id,
    name: p.attendee_name ?? '',
    handle: p.handle ?? null,
    company: p.company ?? '',
    job_title: p.job_title ?? '',
    bio: p.bio ?? '',
    interests: p.interests ?? [],
    avatar_url: p.avatar_url ?? null,
    ticket_name: p.ticket_name ?? '',
    registration_id: p.registration_id,
  }))
}

// T-093: Virtual business card data
export async function getVirtualCardData(registrationId: string) {
  const supabase = await createClient()

  const { data } = await supabase
    .from('attendee_profiles')
    .select(`
      bio, company, job_title, linkedin_url, twitter_url, website_url, avatar_url,
      registrations!inner(attendee_name, attendee_email, qr_code)
    `)
    .eq('registration_id', registrationId)
    .single()

  if (!data) return null
  const d = data as any
  return {
    name: d.registrations?.attendee_name ?? '',
    email: d.registrations?.attendee_email ?? '',
    qr_code: d.registrations?.qr_code ?? '',
    company: d.company ?? '',
    job_title: d.job_title ?? '',
    bio: d.bio ?? '',
    linkedin_url: d.linkedin_url ?? '',
    twitter_url: d.twitter_url ?? '',
    website_url: d.website_url ?? '',
    avatar_url: d.avatar_url ?? '',
  }
}

// ─── T-094a+c: Meeting requests ───────────────────────────────────────────────

const MeetingSchema = z.object({
  recipient_id: z.string().uuid(),
  message: z.string().max(500).optional(),
  proposed_times: z.array(z.string()).max(3).optional(),
  location: z.string().max(200).optional(),
})

export async function sendMeetingRequest(eventId: string, raw: unknown) {
  const user = await requireUser()
  const supabase = await createClient()
  const data = MeetingSchema.parse(raw)

  const { data: existing } = await supabase
    .from('meeting_requests')
    .select('id, status')
    .eq('event_id', eventId)
    .eq('requester_id', user.id)
    .eq('recipient_id', data.recipient_id)
    .single()

  if (existing && (existing as any).status === 'pending') {
    return { error: 'A pending meeting request already exists with this person' }
  }

  const { error } = await supabase.from('meeting_requests').upsert({
    event_id: eventId,
    requester_id: user.id,
    recipient_id: data.recipient_id,
    message: data.message,
    proposed_times: data.proposed_times ?? [],
    location: data.location,
    status: 'pending',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'event_id,requester_id,recipient_id' })

  if (error) return { error: error.message }
  return { success: true }
}

export async function respondToMeetingRequest(
  requestId: string,
  response: 'accepted' | 'declined' | 'counter',
  counterTime?: string,
  counterNote?: string,
) {
  const user = await requireUser()
  const supabase = await createClient()

  const statusMap = { accepted: 'accepted', declined: 'declined', counter: 'pending' } as const
  const { error } = await supabase
    .from('meeting_requests')
    .update({
      status: statusMap[response],
      meeting_counter_time: counterTime ?? null,
      meeting_counter_note: counterNote ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .eq('recipient_id', user.id)

  if (error) return { error: error.message }
  return { ok: true, response }
}

export async function getMeetingRequests(eventId: string) {
  const user = await requireUser()
  const supabase = await createClient()

  const { data } = await supabase
    .from('meeting_requests')
    .select('id, status, message, proposed_times, meeting_at, location, created_at, requester_id, recipient_id')
    .eq('event_id', eventId)
    .or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`)
    .order('created_at', { ascending: false })

  return (data ?? []) as any[]
}

// ─── T-094b/c/f/h/i: Community posts ─────────────────────────────────────────

const PostSchema = z.object({
  post_type: z.enum(['post', 'meetup', 'article']).default('post'),
  body: z.string().max(2000).optional(),
  image_url: z.string().url().optional().or(z.literal('')),
  article_url: z.string().url().optional().or(z.literal('')),
  location: z.string().max(200).optional(),
  starts_at: z.string().optional(),
  session_id: z.string().uuid().optional(),
})

export async function createCommunityPost(eventId: string, raw: unknown) {
  const user = await requireUser()
  const supabase = await createClient()
  const data = PostSchema.parse(raw)

  const { data: post, error } = await supabase
    .from('community_posts')
    .insert({ event_id: eventId, author_id: user.id, ...data })
    .select('id')
    .single()

  if (error) return { error: error.message }

  try {
    const admin = createAdminClient()
    const { count } = await admin
      .from('community_posts')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('author_id', user.id)
      .eq('is_deleted', false)

    if (count === 1) {
      const { awardPoints } = await import('@/lib/engagement/sprint10-actions')
      await awardPoints(eventId, user.id, 'community_post')
    }
  } catch {
    // first-post award failure must never break post creation
  }

  revalidatePath('/e')
  return { data: post }
}

export async function getCommunityPosts(eventId: string, postType?: string, page = 0, sessionId?: string) {
  const supabase = await createClient()
  const PAGE_SIZE = 20

  let q = supabase
    .from('community_posts')
    .select('id, post_type, body, image_url, article_url, og_title, og_image, location, starts_at, is_pinned, upvote_count, reply_count, rsvp_count, created_at, author_id, session_id')
    .eq('event_id', eventId)
    .eq('is_deleted', false)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

  if (postType) q = q.eq('post_type', postType)
  if (sessionId) q = q.eq('session_id', sessionId)

  const { data } = await q
  const posts = (data ?? []) as any[]

  const authorIds = Array.from(new Set(posts.map(p => p.author_id).filter(Boolean)))
  const authorMap = new Map<string, { handle: string | null; full_name: string | null; avatar_url: string | null }>()
  if (authorIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, handle, full_name, avatar_url')
      .in('id', authorIds)
    for (const p of (profiles ?? []) as any[]) {
      authorMap.set(p.id, { handle: p.handle, full_name: p.full_name, avatar_url: p.avatar_url })
    }
  }

  const overrideAvatar = new Map<string, string | null>()
  if (authorIds.length > 0) {
    const admin = createAdminClient()
    const { data: overrides } = await admin
      .from('attendee_profiles')
      .select('user_id, avatar_url')
      .eq('event_id', eventId)
      .in('user_id', authorIds)
    for (const o of (overrides ?? []) as any[]) overrideAvatar.set(o.user_id, o.avatar_url)
  }

  return posts.map(p => {
    const author = authorMap.get(p.author_id) ?? null
    const resolvedAvatar = overrideAvatar.get(p.author_id) ?? author?.avatar_url ?? null
    return { ...p, author: author ? { ...author, avatar_url: resolvedAvatar } : null }
  })
}

export async function deleteCommunityPost(postId: string) {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: post } = await supabase.from('community_posts').select('author_id, event_id').eq('id', postId).single()
  if (!post) return { error: 'Post not found' }

  const isOwner = (post as any).author_id === user.id
  if (!isOwner) {
    const { data: member } = await supabase
      .from('org_members')
      .select('role')
      .eq('org_id', (await supabase.from('events').select('org_id').eq('id', (post as any).event_id).single()).data?.org_id)
      .eq('user_id', user.id)
      .single()
    if (!member) return { error: 'Not authorised' }
  }

  await supabase.from('community_posts').update({ is_deleted: true }).eq('id', postId)
  revalidatePath('/e')
  return { success: true }
}

export async function upvoteCommunityPost(postId: string) {
  const user = await requireUser()
  const supabase = await createClient()

  const { error: insertErr } = await supabase
    .from('community_upvotes')
    .insert({ post_id: postId, user_id: user.id })

  if (!insertErr) {
    const admin = createAdminClient()
    const { count } = await admin
      .from('community_upvotes')
      .select('*', { count: 'exact', head: true })
      .eq('post_id', postId)
    await admin.from('community_posts').update({ upvote_count: count ?? 0 }).eq('id', postId)
  }
  return { success: true }
}

export async function rsvpToMeetup(postId: string) {
  const user = await requireUser()
  const supabase = await createClient()

  const { error } = await supabase.from('community_rsvps').insert({ post_id: postId, user_id: user.id })
  if (!error) {
    const admin = createAdminClient()
    const { count } = await admin
      .from('community_rsvps')
      .select('*', { count: 'exact', head: true })
      .eq('post_id', postId)
    await admin.from('community_posts').update({ rsvp_count: count ?? 0 }).eq('id', postId)
  }
  return { success: true }
}

// T-094f: Community replies
export async function addCommunityReply(postId: string, body: string) {
  const user = await requireUser()
  const supabase = await createClient()

  if (!body.trim()) return { error: 'Reply cannot be empty' }

  const { data, error } = await supabase
    .from('community_replies')
    .insert({ post_id: postId, author_id: user.id, body: body.trim() })
    .select('id, body, created_at, author_id')
    .single()

  if (error) return { error: error.message }

  const admin = createAdminClient()
  const { count } = await admin
    .from('community_replies')
    .select('*', { count: 'exact', head: true })
    .eq('post_id', postId)
    .eq('is_deleted', false)
  await admin.from('community_posts').update({ reply_count: count ?? 0 }).eq('id', postId)

  try {
    const { data: post } = await admin
      .from('community_posts')
      .select('author_id, event_id')
      .eq('id', postId)
      .single()

    if (post) {
      const postAuthorId = (post as any).author_id as string
      const eventId = (post as any).event_id as string

      const { data: replyAuthors } = await admin
        .from('community_replies')
        .select('author_id')
        .eq('post_id', postId)
        .eq('is_deleted', false)
        .neq('author_id', postAuthorId)

      const distinctCount = new Set((replyAuthors ?? []).map((r: any) => r.author_id)).size

      const MILESTONES: [number, number][] = [[1, 20], [5, 10], [10, 5]]
      for (const [threshold, pts] of MILESTONES) {
        if (distinctCount >= threshold) {
          const { data: inserted } = await admin
            .from('community_reply_milestones')
            .upsert({ post_id: postId, milestone: threshold }, { onConflict: 'post_id,milestone', ignoreDuplicates: true })
            .select()

          if (inserted && inserted.length > 0) {
            const { awardPoints } = await import('@/lib/engagement/sprint10-actions')
            await awardPoints(eventId, postAuthorId, 'community_post', pts)
          }
        }
      }
    }
  } catch {
    // milestone/points failures must never break reply creation
  }

  return { data }
}

export async function getCommunityReplies(postId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('community_replies')
    .select('id, body, created_at, author_id')
    .eq('post_id', postId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })
  const replies = (data ?? []) as any[]

  const authorIds = Array.from(new Set(replies.map(r => r.author_id).filter(Boolean)))
  const authorMap = new Map<string, { handle: string | null; full_name: string | null; avatar_url: string | null }>()
  if (authorIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, handle, full_name, avatar_url')
      .in('id', authorIds)
    for (const p of (profiles ?? []) as any[]) {
      authorMap.set(p.id, { handle: p.handle, full_name: p.full_name, avatar_url: p.avatar_url })
    }
  }

  const overrideAvatar = new Map<string, string | null>()
  if (authorIds.length > 0) {
    const { data: post } = await supabase
      .from('community_posts')
      .select('event_id')
      .eq('id', postId)
      .single()
    const eventId = (post as any)?.event_id
    if (eventId) {
      const admin = createAdminClient()
      const { data: overrides } = await admin
        .from('attendee_profiles')
        .select('user_id, avatar_url')
        .eq('event_id', eventId)
        .in('user_id', authorIds)
      for (const o of (overrides ?? []) as any[]) overrideAvatar.set(o.user_id, o.avatar_url)
    }
  }

  return replies.map(r => {
    const author = authorMap.get(r.author_id) ?? null
    const resolvedAvatar = overrideAvatar.get(r.author_id) ?? author?.avatar_url ?? null
    return { ...r, author: author ? { ...author, avatar_url: resolvedAvatar } : null }
  })
}

// T-094g: Follow/unfollow
export async function followAttendee(eventId: string, targetUserId: string) {
  const user = await requireUser()
  const supabase = await createClient()
  await supabase.from('attendee_follows').upsert({ follower_id: user.id, followed_id: targetUserId, event_id: eventId })
  return { success: true }
}

export async function unfollowAttendee(eventId: string, targetUserId: string) {
  const user = await requireUser()
  const supabase = await createClient()
  await supabase.from('attendee_follows').delete()
    .eq('follower_id', user.id).eq('followed_id', targetUserId).eq('event_id', eventId)
  return { success: true }
}

export async function getFollowStatus(eventId: string, targetUserId: string) {
  const user = await requireUser()
  const supabase = await createClient()
  const { data } = await supabase
    .from('attendee_follows')
    .select('follower_id')
    .eq('follower_id', user.id)
    .eq('followed_id', targetUserId)
    .eq('event_id', eventId)
    .single()
  return { following: !!data }
}

// T-094d: Icebreaker questions
export async function getIcebreakerQuestions(limit = 5) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('icebreaker_questions')
    .select('id, question, category')
    .eq('is_active', true)
    .limit(limit)
  return (data ?? []) as any[]
}

// T-094j: Community moderation
export async function reportCommunityContent(postId: string | null, replyId: string | null, reason: string) {
  const user = await requireUser()
  const supabase = await createClient()

  const { error } = await supabase.from('community_reports').insert({
    post_id: postId,
    reply_id: replyId,
    reporter_id: user.id,
    reason,
  })
  if (error) return { error: error.message }
  return { success: true }
}

export async function getCommunityReports(eventId: string) {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: reports } = await supabase
    .from('community_reports')
    .select('id, reason, created_at, resolved_at, post_id, reply_id, community_posts!inner(event_id)')
    .is('resolved_at', null)
    .order('created_at', { ascending: false })

  return ((reports ?? []) as any[]).filter((r: any) => r.community_posts?.event_id === eventId)
}

export async function resolveCommunityReport(reportId: string) {
  const user = await requireUser()
  const supabase = await createClient()
  await supabase
    .from('community_reports')
    .update({ resolved_at: new Date().toISOString(), resolved_by: user.id })
    .eq('id', reportId)
  return { success: true }
}

// ─── T-091b: Matchmaking (keyword-based similarity) ──────────────────────────

function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2)
  )
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0
  let intersection = 0
  for (const item of a) if (b.has(item)) intersection++
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

export async function getMatchSuggestions(eventId: string, registrationId: string, limit = 8) {
  const supabase = await createClient()

  const { data: myProfile } = await supabase
    .from('attendee_profiles')
    .select('interests, bio, company, job_title, user_id')
    .eq('registration_id', registrationId)
    .single()

  if (!myProfile) return []

  const { data: others } = await supabase
    .from('event_visible_profiles')
    .select('id, bio, company, job_title, interests, avatar_url, registration_id, user_id, attendee_name, handle, ticket_name')
    .eq('event_id', eventId)
    .neq('registration_id', registrationId)
    .limit(200)

  if (!others?.length) return []

  const mp = myProfile as any
  const myInterests = new Set<string>((mp.interests ?? []).map((i: string) => i.toLowerCase().trim()))
  const myText = tokenize([mp.bio ?? '', mp.company ?? '', mp.job_title ?? ''].join(' '))

  const scored = others.map((o: any) => {
    const theirInterests = new Set<string>((o.interests ?? []).map((i: string) => i.toLowerCase().trim()))
    const theirText = tokenize([o.bio ?? '', o.company ?? '', o.job_title ?? ''].join(' '))

    const interestScore = jaccardSimilarity(myInterests, theirInterests)
    const textScore = jaccardSimilarity(myText, theirText)
    const score = interestScore * 0.7 + textScore * 0.3

    return {
      id: o.id,
      registration_id: o.registration_id,
      name: o.attendee_name ?? '',
      handle: o.handle ?? null,
      company: o.company ?? '',
      job_title: o.job_title ?? '',
      bio: o.bio ?? '',
      interests: o.interests ?? [],
      avatar_url: o.avatar_url ?? null,
      ticket_name: o.ticket_name ?? '',
      score,
    }
  })

  return scored
    .filter(p => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ score: _score, ...rest }) => rest)
}
