import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { getMyProfile, upsertAttendeeProfile, getIcebreakerQuestions } from '@/lib/networking/sprint8-actions'
import { AvatarUpload } from '@/components/upload/AvatarUpload'
import { Field } from '@/components/ui/Field'

type Props = { params: Promise<{ slug: string }> }

export default async function ProfileEditPage({ params }: Props) {
  const { slug } = await params
  const user = await requireUser()
  const supabase = await createClient()

  const { data: event } = await supabase
    .from('events').select('id, title').eq('slug', slug).single()
  if (!event) notFound()

  const [profileData, icebreakers] = await Promise.all([
    getMyProfile((event as any).id),
    getIcebreakerQuestions(5),
  ])

  if (!profileData) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--pz-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="pz-card p-8 text-center" style={{ maxWidth: 480 }}>
          <h1 className="text-lg font-bold mb-2" style={{ color: 'var(--pz-text)' }}>No registration found</h1>
          <p className="text-sm" style={{ color: 'var(--pz-muted)' }}>You need to be registered for this event to create a profile.</p>
          <a href={`/e/${slug}/register`} className="inline-block mt-4 text-sm" style={{ color: 'var(--pz-teal)' }}>Register for this event →</a>
        </div>
      </div>
    )
  }

  const { profile, registrationId } = profileData
  const p = (profile ?? {}) as any

  const inputCls = 'w-full rounded-lg px-3 py-2 text-sm focus:outline-none'
  const inputStyle = { background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', color: 'var(--pz-text)' }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--pz-bg)' }}>
      <div style={{ background: 'var(--pz-surface)', borderBottom: '1px solid var(--pz-border)', padding: '1.25rem 1.5rem' }}>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          <a href={`/e/${slug}/people`} style={{ color: 'var(--pz-teal)', fontSize: 13, textDecoration: 'none' }}>← People</a>
        </div>
      </div>
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '2rem 1.5rem' }}>
        <h1 className="text-xl font-bold mb-6" style={{ color: 'var(--pz-text)' }}>My Profile</h1>

        <form
          action={async (fd: FormData) => {
            'use server'
            const interestsRaw = (fd.get('interests') as string) ?? ''
            await upsertAttendeeProfile(registrationId, {
              bio: fd.get('bio') as string || undefined,
              company: fd.get('company') as string || undefined,
              job_title: fd.get('job_title') as string || undefined,
              interests: interestsRaw.split(',').map(s => s.trim()).filter(Boolean),
              avatar_url: fd.get('avatar_url') as string || undefined,
              linkedin_url: fd.get('linkedin_url') as string || undefined,
              twitter_url: fd.get('twitter_url') as string || undefined,
              website_url: fd.get('website_url') as string || undefined,
              is_visible: fd.get('is_visible') === 'on',
            })
          }}
          className="space-y-5"
        >
          <div className="pz-card p-5 space-y-4">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--pz-label)' }}>Basic info</h2>
            <Field label="Bio" htmlFor="profile-bio">
              <textarea
                id="profile-bio"
                name="bio"
                rows={4}
                defaultValue={p.bio ?? ''}
                placeholder="Tell other attendees about yourself…"
                className={inputCls + ' resize-none'}
                style={inputStyle}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Company" htmlFor="profile-company">
                <input id="profile-company" name="company" defaultValue={p.company ?? ''} placeholder="Acme Corp" className={inputCls} style={inputStyle} />
              </Field>
              <Field label="Job title" htmlFor="profile-job-title">
                <input id="profile-job-title" name="job_title" defaultValue={p.job_title ?? ''} placeholder="Head of Product" className={inputCls} style={inputStyle} />
              </Field>
            </div>
            <Field label="Interests (comma-separated)" htmlFor="profile-interests">
              <input
                id="profile-interests"
                name="interests"
                defaultValue={(p.interests ?? []).join(', ')}
                placeholder="AI, product strategy, hiking"
                className={inputCls}
                style={inputStyle}
              />
            </Field>
          </div>

          <div className="pz-card p-5 space-y-4">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--pz-label)' }}>Links</h2>
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--pz-muted)' }}>Profile photo</label>
              <AvatarUpload currentUrl={p.avatar_url ?? ''} />
            </div>
            <Field label="LinkedIn URL" htmlFor="profile-linkedin">
              <input id="profile-linkedin" name="linkedin_url" type="url" defaultValue={p.linkedin_url ?? ''} placeholder="https://linkedin.com/in/…" className={inputCls} style={inputStyle} />
            </Field>
            <Field label="Twitter / X URL" htmlFor="profile-twitter">
              <input id="profile-twitter" name="twitter_url" type="url" defaultValue={p.twitter_url ?? ''} placeholder="https://x.com/…" className={inputCls} style={inputStyle} />
            </Field>
            <Field label="Website" htmlFor="profile-website">
              <input id="profile-website" name="website_url" type="url" defaultValue={p.website_url ?? ''} placeholder="https://…" className={inputCls} style={inputStyle} />
            </Field>
          </div>

          {icebreakers.length > 0 && (
            <div className="pz-card p-5 space-y-4">
              <h2 className="text-sm font-semibold" style={{ color: 'var(--pz-label)' }}>Icebreaker questions</h2>
              <p className="text-xs" style={{ color: 'var(--pz-muted)' }}>Answer a few to help others connect with you.</p>
              {icebreakers.map((q: any) => (
                <Field key={q.id} label={q.question} htmlFor={`ib-${q.id}`}>
                  <input
                    id={`ib-${q.id}`}
                    name={`icebreaker_${q.id}`}
                    defaultValue={(p.icebreaker_answers ?? {})[q.id] ?? ''}
                    placeholder="Your answer…"
                    className={inputCls}
                    style={inputStyle}
                  />
                </Field>
              ))}
            </div>
          )}

          <div className="pz-card p-5">
            <label className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: 'var(--pz-muted)' }}>
              <input type="checkbox" name="is_visible" defaultChecked={p.is_visible !== false} className="accent-[var(--pz-teal)]" />
              Show my profile in the attendee directory
            </label>
          </div>

          <button
            type="submit"
            className="w-full rounded-lg px-4 py-3 text-sm font-semibold"
            style={{ background: 'var(--pz-teal)', color: 'var(--pz-on-accent)' }}
          >
            Save profile
          </button>
        </form>
      </div>
    </div>
  )
}
