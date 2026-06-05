# Prezva Design Tokens

> Single source of truth for the Prezva visual system.
> CSS variables live in `src/app/globals.css`. JS/TS values in `src/lib/brand.ts`.
> Mockups: `design/mockups/`. Logo identity: `design/brand/arc-check-v1/`.
> Redesign (2026-06): the system is now a CANVAS (light) + CHROME (dark) split — see below.

---

## Color Palette

The redesign splits the palette in two: a **light canvas** for content surfaces, and a **dark "chrome"** for the persistent app frame (sidebars, kiosk, top rails). Teal is the shared accent.

### Canvas (light — content)
| Token            | Hex       | Usage                                    |
|------------------|-----------|------------------------------------------|
| `--pz-bg`        | `#EDF1F6` | Page background                          |
| `--pz-surface`   | `#FFFFFF` | Cards, panels                            |
| `--pz-surface-2` | `#F4F7FB` | Elevated / inset surfaces                |
| `--pz-border`    | `#E3E9F0` | Borders (1px)                            |
| `--pz-text`      | `#0D1B2A` | Primary text (ink)                       |
| `--pz-muted`     | `#475A70` | Secondary text, labels                   |
| `--pz-label`     | `#6B7C92` | Captions, helper text                    |

### Chrome (dark — app frame: sidebars, kiosk, rails)
| Token                  | Hex / value             | Usage                             |
|------------------------|-------------------------|-----------------------------------|
| `--pz-chrome`          | `#0D1B2A`               | Chrome background (sidebar/kiosk) |
| `--pz-chrome-2`        | `#0A1521`               | Deeper chrome                     |
| `--pz-chrome-elevated` | `#112240`               | Raised chrome panels              |
| `--pz-chrome-text`     | `#E6EDF5`               | Text on chrome                    |
| `--pz-chrome-muted`    | `#8DA2BC`               | Muted text on chrome              |
| `--pz-chrome-line`     | `rgba(255,255,255,.08)` | Dividers on chrome                |
| `--pz-chrome-active`   | `rgba(45,212,191,.14)`  | Active nav background on chrome   |

### Accent (teal)
| Token             | Hex       | Usage                                            |
|-------------------|-----------|--------------------------------------------------|
| `--pz-teal`       | `#2DD4BF` | Fills, chrome accents, icons (NOT text on light) |
| `--pz-teal-ink`   | `#0F766E` | Teal text / links on the light canvas            |
| `--pz-on-accent`  | `#0D1B2A` | Text on teal backgrounds (buttons)               |
| `--pz-teal-light` | `#00E5CC` | Hover / glow (compat)                            |
| `--pz-teal-dim`   | `#007A6B` | Muted teal (compat)                              |

### Semantic
| Token               | Hex       | Usage                          |
|---------------------|-----------|--------------------------------|
| `--pz-success`      | `#047857` | Success text/ink (online sync) |
| `--pz-success-fill` | `#22C55E` | Success dot / fill             |
| `--pz-success-bg`   | `#E7F6EF` | Success banner background      |
| `--pz-warning`      | `#B45309` | Warning text/ink               |
| `--pz-warning-fill` | `#F59E0B` | Warning dot / fill             |
| `--pz-error`        | `#DC2626` | Error text (offline sync)      |
| `--pz-error-bg`     | `#FCEBEB` | Error banner background        |
| `--pz-live`         | `#E11D48` | LIVE badge                     |

> Finalized brand teal: `#2DD4BF` (was `#00BFA6` pre-launch). On the light canvas use `--pz-teal-ink` for teal *text/links* — raw `--pz-teal` fails contrast as text on white.

---

## Typography

- **Font**: Geist (Next.js stack via `next/font`). Mono: Geist Mono.
- **H1** `2rem / 700` · **H2** `1.5rem / 600` · **H3** `1.25rem / 600`
- **Body** `1rem / 400` · **Small** `0.875rem / 400` · **Label** `0.75rem / 500` + `tracking-wide`
- Note: the v1 brand showcase HTML (`arc-check-v1/`) renders in Plus Jakarta Sans for *display only*; the product UI is Geist.

---

## Spacing & Radius

- **Spacing base**: 4px (Tailwind default — do not customize)
- **Card** `rounded-xl` (12px) · **Button** `rounded-lg` (8px) · **Input** `rounded-md` (6px) · **Badge/Avatar** `rounded-full`

---

## Shadows

- **Card**: `--pz-shadow` = `0 1px 3px rgba(13,27,42,.08), 0 8px 24px rgba(13,27,42,.06)` (soft, light canvas)
- **Teal focus ring**: `--pz-shadow-teal` = `0 0 0 3px rgba(45,212,191,.25)`
- **Sync dot glow**: `0 0 8px <color>` — success / warning / error

---

## Key UI Patterns (from mockups)

### Offline Sync Health indicator
- Sidebar (chrome) bottom, always visible
- Glowing dot + "Offline Sync Health: 100%" (success / warning / error states)
- CSS class: `.pz-dot-online` / `.pz-dot-warning` / `.pz-dot-offline`
- Signature brand element — do not remove or hide

### Stat cards
- Background `--pz-surface` (light); value `text-3xl font-bold` in `--pz-text`; label `--pz-muted`
- Teal bottom bar (`.pz-stat-bar`, 3px)
- Dashboard set: Registered | Checked In | Active Sessions | System Health

### Check-in feed
- Avatar (rounded-full 36px) + name (font-medium) + "Checked In: HH:MM AM/PM"; right chevron → detail
- Real-time via Supabase Realtime

### LIVE badge
- `.pz-live-badge` — `--pz-live` pink, pill; shown only when event status = 'live'

### Sidebar nav (chrome)
- The sidebar is dark **chrome**: text `--pz-chrome-text`, muted `--pz-chrome-muted`
- Active item: `--pz-chrome-active` background + teal accent; collapsible accordion (redesign)

---

## Redesign system (2026-06)
- Canvas/chrome token split (above), accordion `SideNav`, shared kit (`Field`, `Toast`, `PageNav`, `PageHeader`, `StatCard`, `StatusBadge`, `ConfirmDialog`, `EmptyState`) in `src/components/ui/`.
- Layout archetypes: organizer shell, event shell, attendee shell (mobile bottom-tabs), kiosk + portal frame, auth.
- Logo on light: wordmark uses `public/logo-dark.svg` (`#0D1B2A`); per the `arc-check-v1` Production Spec ("#0D1B2A on white").
