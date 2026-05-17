'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  createCommunityPost,
  getCommunityPosts,
  deleteCommunityPost,
  upvoteCommunityPost,
  rsvpToMeetup,
  addCommunityReply,
  getCommunityReplies,
  reportCommunityContent,
} from '@/lib/networking/sprint8-actions'

interface OGData { title: string; description: string; image: string }
interface Post {
  id: string
  post_type: string
  body: string
  image_url: string
  article_url: string
  og_title: string
  og_image: string
  location: string
  starts_at: string
  is_pinned: boolean
  upvote_count: number
  reply_count: number
  rsvp_count: number
  created_at: string
  author_id: string
}

type PostType = 'post' | 'meetup' | 'article'

export function CommunityClient({
  eventSlug,
  eventId,
  userId,
  initialPosts,
  initialType,
}: {
  eventSlug: string
  eventId: string
  userId: string | null
  initialPosts: Post[]
  initialType: string
}) {
  const [posts, setPosts] = useState<Post[]>(initialPosts)
  const [filter, setFilter] = useState<string>(initialType)
  const [postType, setPostType] = useState<PostType>('post')
  const [body, setBody] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [articleUrl, setArticleUrl] = useState('')
  const [ogData, setOgData] = useState<OGData | null>(null)
  const [ogLoading, setOgLoading] = useState(false)
  const [location, setLocation] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [imageUploading, setImageUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [expandedReplies, setExpandedReplies] = useState<Record<string, boolean>>({})
  const [replies, setReplies] = useState<Record<string, any[]>>({})
  const [replyBody, setReplyBody] = useState<Record<string, string>>({})
  const supabaseRef = useRef(createClient())

  useEffect(() => {
    getCommunityPosts(eventId, filter || undefined).then(p => setPosts(p as Post[]))
  }, [eventId, filter])

  useEffect(() => {
    const sb = supabaseRef.current
    const channel = sb
      .channel(`community:${eventId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_posts', filter: `event_id=eq.${eventId}` }, payload => {
        const post = payload.new as Post
        setPosts(prev => [post, ...prev])
      })
      .subscribe()
    return () => { sb.removeChannel(channel) }
  }, [eventId])

  async function fetchOG(url: string) {
    if (!url.startsWith('http')) return
    setOgLoading(true)
    try {
      const res = await fetch(`/api/og-preview?url=${encodeURIComponent(url)}`)
      const data = await res.json()
      if (!data.error) setOgData(data as OGData)
    } catch {}
    setOgLoading(false)
  }

  async function handleSubmit() {
    if (!userId) return
    const postBody = body.trim()
    if (!postBody && postType !== 'article') return
    setSubmitting(true)

    await createCommunityPost(eventId, {
      post_type: postType,
      body: postBody || undefined,
      image_url: postType === 'post' ? imageUrl || undefined : undefined,
      article_url: postType === 'article' ? articleUrl || undefined : undefined,
      location: postType !== 'post' ? location || undefined : undefined,
      starts_at: postType === 'meetup' ? startsAt || undefined : undefined,
    })

    setBody('')
    setImageUrl('')
    setArticleUrl('')
    setOgData(null)
    setLocation('')
    setStartsAt('')
    setSubmitting(false)
  }

  async function handleUpvote(postId: string) {
    if (!userId) return
    await upvoteCommunityPost(postId)
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, upvote_count: p.upvote_count + 1 } : p))
  }

  async function handleRSVP(postId: string) {
    if (!userId) return
    await rsvpToMeetup(postId)
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, rsvp_count: p.rsvp_count + 1 } : p))
  }

  async function handleDelete(postId: string) {
    if (!confirm('Delete this post?')) return
    await deleteCommunityPost(postId)
    setPosts(prev => prev.filter(p => p.id !== postId))
  }

  async function handleReport(postId: string) {
    const reason = prompt('Reason for report (optional):') ?? ''
    await reportCommunityContent(postId, null, reason || 'Reported by user')
    alert('Reported. Our team will review.')
  }

  async function toggleReplies(postId: string) {
    const expanded = !expandedReplies[postId]
    setExpandedReplies(prev => ({ ...prev, [postId]: expanded }))
    if (expanded && !replies[postId]) {
      const r = await getCommunityReplies(postId)
      setReplies(prev => ({ ...prev, [postId]: r }))
    }
  }

  async function handleReply(postId: string) {
    const text = (replyBody[postId] ?? '').trim()
    if (!text || !userId) return
    const result = await addCommunityReply(postId, text)
    if (!('error' in result) && result.data) {
      setReplies(prev => ({ ...prev, [postId]: [...(prev[postId] ?? []), result.data] }))
      setReplyBody(prev => ({ ...prev, [postId]: '' }))
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, reply_count: p.reply_count + 1 } : p))
    }
  }

  const inputStyle = { background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', color: 'var(--pz-text)' }
  const filters = [{ value: '', label: 'All' }, { value: 'post', label: 'Posts' }, { value: 'meetup', label: 'Meetups' }, { value: 'article', label: 'Articles' }]
  const types: { value: PostType; label: string }[] = [{ value: 'post', label: 'Post' }, { value: 'meetup', label: 'Meetup' }, { value: 'article', label: 'Article' }]

  return (
    <div>
      {/* Compose */}
      {userId && (
        <div className="pz-card p-4 mb-6">
          <div className="flex gap-2 mb-3">
            {types.map(t => (
              <button
                key={t.value}
                onClick={() => setPostType(t.value)}
                className="rounded-full px-3 py-1 text-xs font-semibold"
                style={{
                  background: postType === t.value ? 'var(--pz-teal)' : 'var(--pz-surface-2)',
                  color: postType === t.value ? '#0D1B2A' : 'var(--pz-muted)',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={3}
            placeholder={postType === 'post' ? "What's on your mind?" : postType === 'meetup' ? "Describe your meetup…" : "Share some context…"}
            className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none resize-none mb-3"
            style={inputStyle}
          />

          {postType === 'post' && (
            <div className="mb-3">
              {imageUrl ? (
                <div className="relative inline-block">
                  <img src={imageUrl} alt="Preview" className="rounded-lg max-h-40 max-w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setImageUrl('')}
                    className="absolute top-1 right-1 rounded-full w-5 h-5 text-xs flex items-center justify-center"
                    style={{ background: 'rgba(0,0,0,0.6)', color: '#fff' }}
                  >×</button>
                </div>
              ) : (
                <label
                  className="inline-flex items-center gap-1.5 cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold"
                  style={{ background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', color: 'var(--pz-muted)' }}
                >
                  {imageUploading ? 'Uploading…' : '📷 Add image'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    disabled={imageUploading}
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      setImageUploading(true)
                      const fd = new FormData()
                      fd.append('file', file)
                      fd.append('eventId', eventId)
                      const res = await fetch('/api/upload/community-image', { method: 'POST', body: fd })
                      const json = await res.json()
                      setImageUploading(false)
                      if (res.ok) setImageUrl(json.url)
                    }}
                  />
                </label>
              )}
            </div>
          )}

          {postType === 'article' && (
            <div className="mb-3 space-y-2">
              <input
                value={articleUrl}
                onChange={e => setArticleUrl(e.target.value)}
                onBlur={() => fetchOG(articleUrl)}
                placeholder="Article URL"
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                style={inputStyle}
              />
              {ogLoading && <p className="text-xs" style={{ color: 'var(--pz-muted)' }}>Loading preview…</p>}
              {ogData && (
                <div className="rounded-lg p-3 flex gap-3" style={{ background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)' }}>
                  {ogData.image && <img src={ogData.image} alt="" className="rounded w-16 h-16 object-cover shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate" style={{ color: 'var(--pz-text)' }}>{ogData.title}</p>
                    <p className="text-xs truncate" style={{ color: 'var(--pz-muted)' }}>{ogData.description}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {(postType === 'meetup') && (
            <div className="mb-3 grid grid-cols-2 gap-2">
              <input value={location} onChange={e => setLocation(e.target.value)} placeholder="Location (optional)" className="rounded-lg px-3 py-2 text-sm focus:outline-none" style={inputStyle} />
              <input type="datetime-local" value={startsAt} onChange={e => setStartsAt(e.target.value)} className="rounded-lg px-3 py-2 text-sm focus:outline-none" style={inputStyle} />
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={handleSubmit}
              disabled={submitting || (!body.trim() && postType !== 'article')}
              className="rounded-lg px-5 py-2 text-sm font-semibold disabled:opacity-40"
              style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
            >
              {submitting ? 'Posting…' : 'Post'}
            </button>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4">
        {filters.map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className="rounded-full px-3 py-1 text-xs font-semibold"
            style={{
              background: filter === f.value ? 'var(--pz-teal)' : 'var(--pz-surface-2)',
              color: filter === f.value ? '#0D1B2A' : 'var(--pz-muted)',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Feed */}
      {posts.length === 0 ? (
        <div className="pz-card p-12 text-center">
          <p className="text-sm" style={{ color: 'var(--pz-muted)' }}>No posts yet. Be the first!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map(post => (
            <div key={post.id} className="pz-card p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  {post.is_pinned && (
                    <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}>Pinned</span>
                  )}
                  <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: 'var(--pz-surface-2)', color: 'var(--pz-muted)' }}>
                    {post.post_type === 'meetup' ? '📅 Meetup' : post.post_type === 'article' ? '📄 Article' : '💬 Post'}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--pz-muted)' }}>
                    {new Date(post.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex gap-1">
                  {userId === post.author_id && (
                    <button onClick={() => handleDelete(post.id)} className="text-xs px-2 py-1 rounded" style={{ color: 'var(--pz-muted)' }}>Delete</button>
                  )}
                  {userId && userId !== post.author_id && (
                    <button onClick={() => handleReport(post.id)} className="text-xs px-2 py-1 rounded" style={{ color: 'var(--pz-muted)' }}>Report</button>
                  )}
                </div>
              </div>

              {post.body && <p className="text-sm mb-3" style={{ color: 'var(--pz-text)', lineHeight: 1.6 }}>{post.body}</p>}

              {post.image_url && (
                <img src={post.image_url} alt="" className="rounded-lg mb-3 max-h-64 w-full object-cover" />
              )}

              {post.article_url && (
                <a href={post.article_url} target="_blank" rel="noreferrer" className="block rounded-lg p-3 mb-3 hover:opacity-90" style={{ background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', textDecoration: 'none' }}>
                  <div className="flex gap-3">
                    {post.og_image && <img src={post.og_image} alt="" className="rounded w-14 h-14 object-cover shrink-0" />}
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate" style={{ color: 'var(--pz-text)' }}>{post.og_title || post.article_url}</p>
                      <p className="text-xs" style={{ color: 'var(--pz-muted)' }}>{new URL(post.article_url).hostname}</p>
                    </div>
                  </div>
                </a>
              )}

              {post.post_type === 'meetup' && (post.location || post.starts_at) && (
                <div className="flex gap-3 text-xs mb-3" style={{ color: 'var(--pz-muted)' }}>
                  {post.location && <span>📍 {post.location}</span>}
                  {post.starts_at && <span>🕐 {new Date(post.starts_at).toLocaleString()}</span>}
                </div>
              )}

              <div className="flex items-center gap-4 pt-2 border-t" style={{ borderColor: 'var(--pz-border)' }}>
                <button onClick={() => handleUpvote(post.id)} className="flex items-center gap-1 text-xs" style={{ color: 'var(--pz-muted)' }}>
                  ▲ {post.upvote_count}
                </button>
                <button onClick={() => toggleReplies(post.id)} className="flex items-center gap-1 text-xs" style={{ color: 'var(--pz-muted)' }}>
                  💬 {post.reply_count} {expandedReplies[post.id] ? '▲' : '▼'}
                </button>
                {post.post_type === 'meetup' && (
                  <button onClick={() => handleRSVP(post.id)} className="flex items-center gap-1 text-xs" style={{ color: 'var(--pz-muted)' }}>
                    ✓ RSVP ({post.rsvp_count})
                  </button>
                )}
              </div>

              {expandedReplies[post.id] && (
                <div className="mt-3 pt-3 border-t space-y-2" style={{ borderColor: 'var(--pz-border)' }}>
                  {(replies[post.id] ?? []).map((r: any) => (
                    <div key={r.id} className="text-xs rounded-lg px-3 py-2" style={{ background: 'var(--pz-surface-2)', color: 'var(--pz-text)' }}>
                      {r.body}
                    </div>
                  ))}
                  {userId && (
                    <div className="flex gap-2 mt-2">
                      <input
                        value={replyBody[post.id] ?? ''}
                        onChange={e => setReplyBody(prev => ({ ...prev, [post.id]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') handleReply(post.id) }}
                        placeholder="Write a reply…"
                        className="flex-1 rounded-lg px-3 py-1.5 text-xs focus:outline-none"
                        style={{ background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', color: 'var(--pz-text)' }}
                      />
                      <button
                        onClick={() => handleReply(post.id)}
                        className="rounded-lg px-3 py-1.5 text-xs font-semibold"
                        style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
                      >
                        Reply
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
