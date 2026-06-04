'use client'
import { useState } from 'react'
import { Upload } from 'lucide-react'
import { updateOrg } from '@/lib/orgs/actions'

interface OrgForSettings {
  id: string
  name: string
  timezone: string
  logo_url?: string | null
  website?: string | null
  description?: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
}

interface Props { org: OrgForSettings }

export function OrgSettingsForm({ org }: Props) {
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [logoUrl, setLogoUrl] = useState(org.logo_url ?? '')
  const [uploading, setUploading] = useState(false)

  const inputCls = 'w-full rounded-lg border border-[#1E3A5F] bg-[#112240] px-3 py-2 text-sm text-[#F0F4F8] focus:border-[#2DD4BF] focus:outline-none focus:ring-1 focus:ring-[#2DD4BF]'
  const labelCls = 'mb-1 block text-sm font-medium text-[#94A3B8]'

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('type', 'org-logo')
    fd.append('orgId', org.id)
    fd.append('entityId', org.id)
    const res = await fetch('/api/upload', { method: 'POST', body: fd })
    const json = await res.json()
    if (json.url) setLogoUrl(json.url)
    else setError(json.error ?? 'Upload failed')
    setUploading(false)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess(false)
    const fd = new FormData(e.currentTarget)
    fd.set('logo_url', logoUrl)
    const result = await updateOrg(org.id, fd)
    if (result?.error) setError(result.error)
    else setSuccess(true)
    setSaving(false)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Logo */}
      <div>
        <label className={labelCls}>Logo</label>
        <div className="flex items-center gap-4">
          {logoUrl && (
            <img src={logoUrl} alt="Logo" className="h-14 w-14 rounded-lg object-contain border border-[#1E3A5F] bg-[#0D1B2A] p-1" />
          )}
          <label className="cursor-pointer flex items-center gap-2 rounded-lg border border-[#1E3A5F] px-3 py-2 text-sm text-[#94A3B8] hover:border-[#2DD4BF] transition-colors">
            <Upload size={14} />
            {uploading ? 'Uploading…' : 'Choose file'}
            <input type="file" accept="image/*" onChange={handleLogoChange} className="sr-only" />
          </label>
        </div>
      </div>

      {/* Name + Timezone */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Name</label>
          <input name="name" defaultValue={org.name} required className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Timezone</label>
          <select name="timezone" defaultValue={org.timezone} className={inputCls}>
            <option value="America/New_York">Eastern (ET)</option>
            <option value="America/Chicago">Central (CT)</option>
            <option value="America/Denver">Mountain (MT)</option>
            <option value="America/Los_Angeles">Pacific (PT)</option>
            <option value="UTC">UTC</option>
          </select>
        </div>
      </div>

      {/* Website + Contact Email */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Website</label>
          <input name="website" type="url" defaultValue={org.website ?? ''} placeholder="https://" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Contact Email</label>
          <input name="email" type="email" defaultValue={org.email ?? ''} className={inputCls} />
        </div>
      </div>

      {/* Phone */}
      <div>
        <label className={labelCls}>Phone</label>
        <input name="phone" type="tel" defaultValue={org.phone ?? ''} className={inputCls} />
      </div>

      {/* Description */}
      <div>
        <label className={labelCls}>Description</label>
        <textarea name="description" rows={3} defaultValue={org.description ?? ''} className={`${inputCls} resize-none`} />
      </div>

      {/* Address */}
      <div>
        <label className={labelCls}>Address</label>
        <input name="address" defaultValue={org.address ?? ''} className={inputCls} />
      </div>

      {/* City + State + Country */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={labelCls}>City</label>
          <input name="city" defaultValue={org.city ?? ''} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>State / Province</label>
          <input name="state" defaultValue={org.state ?? ''} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Country</label>
          <input name="country" defaultValue={org.country ?? ''} className={inputCls} />
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {success && <p className="text-sm text-[#2DD4BF]">Changes saved.</p>}

      <button
        type="submit"
        disabled={saving || uploading}
        className="self-start rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60"
        style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
      >
        {saving ? 'Saving…' : 'Save changes'}
      </button>
    </form>
  )
}
