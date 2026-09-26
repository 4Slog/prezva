// O170 / H-R1: the one place email HTML, From names, subjects and links are
// made safe. Every template interpolating a user- or organizer-supplied value
// goes through these.

// Text placed in email HTML (element content or a quoted attribute).
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

// The display-name half of a From header ("Name <noreply@prezva.app>"): an org
// or person name must not add an address, a quote or a line.
export function safeDisplayName(name: string | null | undefined): string {
  const cleaned = (name ?? '').replace(/[<>"\r\n]/g, '').trim()
  return cleaned || 'Prezva'
}

// A subject built from user or organizer text stays on one line.
export function safeSubject(subject: string): string {
  return subject.replace(/[\r\n]+/g, ' ')
}

// A stored URL placed in an href: http(s) only, no characters that could leave
// the attribute, attribute-escaped. Anything else → null, and the link is left out.
export function safeHref(url: string | null | undefined): string | null {
  if (!url || /["'<>`\s\\]/.test(url)) return null
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return escapeHtml(parsed.toString())
  } catch {
    return null
  }
}
