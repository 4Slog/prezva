---
name: brand-assets
description: "Prezva brand SVG files, icon generation, and teal color token — what exists, where it lives, and what's been wired up"
metadata: 
  node_type: memory
  type: project
  originSessionId: 4821029d-6b93-4f7b-8dd1-066502a322d7
---

## Brand SVG Files (added 2026-05-15)
Source: `/home/paul/Prezva/design/brand/arc-check-v1/`

| Source file | Deployed as | Notes |
|-------------|-------------|-------|
| `prezva-mark-primary.svg` | `public/logo-mark.svg` | Arc check mark only, viewBox 120×100 |
| `prezva-wordmark-lockup.svg` | `public/logo.svg` | Mark + PREZVA text, viewBox 320×60 |
| `prezva-favicon-micro.svg` | `public/favicon-source.svg` | Small variant for favicon generation |

## Generated Assets
- `public/icons/icon-192.png` — sharp from logo-mark.svg, 192×192
- `public/icons/icon-512.png` — sharp from logo-mark.svg, 512×512
- `public/icons/icon-512-maskable.png` — same as icon-512
- `public/favicon.ico` — hand-packed ICO (16×16 + 32×32) from favicon-source.svg
- `src/app/favicon.ico` — same ICO copied here (App Router precedence over public/)

## Teal Token
- Finalized brand teal: `#2DD4BF` (was `#00BFA6`)
- Updated in: `src/lib/brand.ts` BRAND.colors.teal, `public/manifest.json` theme_color
- SVG stroke/fill colors already use `#2DD4BF` in the source files

## Wired Locations (all P placeholders replaced)
- `src/components/layout/Sidebar.tsx` — mark (collapsed) / lockup (expanded) via next/image
- `src/app/(auth)/layout.tsx` — lockup in login/signup header
- `src/app/page.tsx` — lockup in homepage nav
- `src/app/not-found.tsx` — mark above 404 text
- `src/app/me/layout.tsx` — mark in attendee header
- `src/app/onboarding/page.tsx` — mark above welcome heading
- `src/app/verify/[verificationId]/page.tsx` — lockup in cert verification header

**Why:** Finalized brand; replaced all Next.js placeholder "P" divs before production launch.
**How to apply:** Use `/logo-mark.svg` for icon-only contexts (48×40 or 32×27), `/logo.svg` for full lockup (148×28 standard).
