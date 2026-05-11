import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import {
  getEventFolders,
  getEventDocuments,
  createEventFolder,
  deleteEventFolder,
  deleteEventDocument,
} from '@/lib/agenda/sprint6-actions'

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ folder?: string; q?: string }> }

function fmtSize(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default async function DocumentsPage({ params, searchParams }: Props) {
  const { slug } = await params
  const { folder: folderId, q } = await searchParams
  const user = await requireUser()
  const supabase = await createClient()

  const { data: event } = await supabase
    .from('events')
    .select('id, title, org_id')
    .eq('slug', slug)
    .single()
  if (!event) notFound()

  const { data: member } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', (event as any).org_id)
    .eq('user_id', user.id)
    .single()
  if (!member) notFound()

  const eventId = (event as any).id
  const [folders, documents] = await Promise.all([
    getEventFolders(eventId),
    getEventDocuments(eventId, q, folderId),
  ])

  const inputCls = 'w-full rounded-lg px-3 py-2 text-sm focus:outline-none'
  const inputStyle = { background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', color: 'var(--pz-text)' }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <p className="text-xs mb-1" style={{ color: 'var(--pz-label)' }}>
          <a href={`/events/${slug}`} style={{ color: 'var(--pz-muted)' }}>← {(event as any).title}</a>
        </p>
        <h1 className="text-xl font-bold" style={{ color: 'var(--pz-text)' }}>Documents</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--pz-muted)' }}>
          Organize and share files with attendees.
        </p>
      </div>

      {/* Search */}
      <form method="get" className="mb-4 flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search documents…"
          className={`${inputCls} flex-1`}
          style={inputStyle}
        />
        <button
          type="submit"
          className="rounded-lg px-4 py-2 text-sm font-semibold"
          style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
        >
          Search
        </button>
      </form>

      <div className="flex gap-4">
        {/* Sidebar: folders */}
        <div className="w-44 shrink-0">
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--pz-label)' }}>Folders</p>
          <a
            href={`/events/${slug}/documents`}
            className="block rounded-lg px-3 py-2 text-sm mb-1"
            style={{
              background: !folderId ? 'var(--pz-teal)' : 'var(--pz-surface-2)',
              color: !folderId ? '#0D1B2A' : 'var(--pz-muted)',
            }}
          >
            All documents
          </a>
          {folders.map((f: any) => (
            <div key={f.id} className="flex items-center justify-between mb-1">
              <a
                href={`/events/${slug}/documents?folder=${f.id}`}
                className="flex-1 rounded-lg px-3 py-2 text-sm truncate"
                style={{
                  background: folderId === f.id ? 'var(--pz-teal)' : 'var(--pz-surface-2)',
                  color: folderId === f.id ? '#0D1B2A' : 'var(--pz-muted)',
                }}
              >
                {f.name}
              </a>
              <form
                action={async () => {
                  'use server'
                  await deleteEventFolder(f.id)
                }}
              >
                <button type="submit" className="ml-1 text-xs hover:opacity-70 px-1" style={{ color: 'var(--pz-error)' }}>✕</button>
              </form>
            </div>
          ))}

          {/* New folder */}
          <form
            action={async (fd: FormData) => {
              'use server'
              const name = fd.get('name') as string
              if (name?.trim()) await createEventFolder(eventId, name.trim())
            }}
            className="mt-3"
          >
            <input
              name="name"
              placeholder="New folder…"
              className={`${inputCls} text-xs`}
              style={{ ...inputStyle, padding: '6px 10px' }}
            />
            <button
              type="submit"
              className="mt-1 w-full rounded-lg py-1 text-xs font-semibold"
              style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
            >
              + Folder
            </button>
          </form>
        </div>

        {/* Document list */}
        <div className="flex-1">
          {documents.length === 0 ? (
            <div className="pz-card p-8 text-center">
              <p className="text-sm" style={{ color: 'var(--pz-muted)' }}>
                {q ? `No results for "${q}"` : 'No documents yet.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {documents.map((d: any) => (
                <div key={d.id} className="pz-card flex items-center justify-between p-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--pz-text)' }}>{d.name}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--pz-muted)' }}>
                      {d.mime_type ?? 'file'}
                      {d.file_size_bytes ? ` · ${fmtSize(d.file_size_bytes)}` : ''}
                      {!d.is_public && ' · private'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 ml-4">
                    <a
                      href={`/api/storage/${d.storage_path}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs hover:opacity-70"
                      style={{ color: 'var(--pz-teal)' }}
                    >
                      Download
                    </a>
                    <form
                      action={async () => {
                        'use server'
                        await deleteEventDocument(d.id)
                      }}
                    >
                      <button type="submit" className="text-xs hover:opacity-70" style={{ color: 'var(--pz-error)' }}>
                        Remove
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
