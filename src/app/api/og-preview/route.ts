import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'Missing url' }, { status: 400 })

  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('Invalid protocol')
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
  }

  try {
    const res = await fetch(parsedUrl.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Prezva/1.0; +https://prezva.app)' },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return NextResponse.json({ error: 'Fetch failed' }, { status: 502 })

    const html = await res.text()

    function extractMeta(property: string): string {
      const patterns = [
        new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'),
        new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, 'i'),
        new RegExp(`<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'),
      ]
      for (const p of patterns) {
        const m = html.match(p)
        if (m) return m[1].trim()
      }
      return ''
    }

    const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i)

    const ogTitle = extractMeta('og:title') || (titleTag?.[1]?.trim() ?? '')
    const ogDescription = extractMeta('og:description') || extractMeta('description')
    const ogImage = extractMeta('og:image')

    return NextResponse.json({
      title: ogTitle,
      description: ogDescription,
      image: ogImage ? new URL(ogImage, parsedUrl.origin).toString() : '',
    })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch preview' }, { status: 502 })
  }
}
