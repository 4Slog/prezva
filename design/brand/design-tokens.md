# Prezva Design Tokens

> Single source of truth for the Prezva visual system.
> CSS lives in `src/app/globals.css`. JS/TS values in `src/lib/brand.ts`.
> Mockups: `~/Prezva/design/mockups/`

---

## Color Palette

| Token            | Hex       | Usage                                    |
|------------------|-----------|------------------------------------------|
| `--pz-bg`        | `#0D1B2A` | Page background                          |
| `--pz-surface`   | `#112240` | Cards, panels, sidebars                  |
| `--pz-surface-2` | `#1A2F4A` | Elevated cards, modals                   |
| `--pz-border`    | `#1E3A5F` | All borders (1px)                        |
| `--pz-teal`      | `#00BFA6` | Primary action, active states, icons     |
| `--pz-teal-light`| `#00E5CC` | Hover states, highlights, glows          |
| `--pz-teal-dim`  | `#007A6B` | Muted teal (disabled, secondary icons)   |
| `--pz-text`      | `#F0F4F8` | Primary text                             |
| `--pz-muted`     | `#94A3B8` | Secondary text, labels                   |
| `--pz-label`     | `#64748B` | Captions, helper text                    |
| `--pz-success`   | `#22C55E` | Online sync, success states              |
| `--pz-warning`   | `#F59E0B` | Pending, not-yet-arrived, caution        |
| `--pz-error`     | `#EF4444` | Errors, offline sync                     |
| `--pz-live`      | `#F43F5E` | LIVE badge                               |

---

## Typography

- **Font**: Geist (already in Next.js stack via `next/font/google`)
- **H1**: `2rem / font-bold` (700)
- **H2**: `1.5rem / font-semibold` (600)
- **H3**: `1.25rem / font-semibold` (600)
- **Body**: `1rem / font-normal` (400)
- **Small**: `0.875rem / font-normal`
- **Label**: `0.75rem / font-medium` (500) + `tracking-wide`

---

## Spacing & Radius

- **Spacing base**: 4px (Tailwind default — do not customize)
- **Card radius**: `rounded-xl` (12px)
- **Button radius**: `rounded-lg` (8px)
- **Badge/Avatar**: `rounded-full`
- **Input radius**: `rounded-md` (6px)

---

## Shadows

- **Card shadow**: `box-shadow: 0 4px 24px rgba(0,0,0,0.4)`
- **Teal glow**: `box-shadow: 0 0 16px rgba(0,191,166,0.25)` — use on sync indicator
- **Sync dot glow**: `0 0 8px <color>` — success/warning/error

---

## Key UI Patterns (from mockups)

### Offline Sync Health indicator
- Sidebar bottom, always visible
- Green glowing dot + "Offline Sync Health: 100%"
- CSS class: `.pz-dot-online` / `.pz-dot-warning` / `.pz-dot-offline`
- This is a signature brand element — do not remove or hide

### Stat cards
- Background: `--pz-surface`
- Value: `text-3xl font-bold text-[--pz-text]`
- Label: `text-sm text-[--pz-muted]`
- Bottom bar: `.pz-stat-bar` (teal gradient, 3px)
- Four cards: Registered | Checked In | Active Sessions | System Health

### Check-in Feed
- Avatar (rounded-full, 36px) + Name (font-medium) + "Checked In: HH:MM AM/PM"
- Right chevron → opens attendee detail
- Real-time via Supabase Realtime subscription

### LIVE badge
- `.pz-live-badge` — hot pink, pill shape
- Only shown when event status = 'live'

### Sidebar nav
- Active: `.pz-nav-active` — teal left border + teal text + dim teal bg
- Inactive: `.pz-nav-item` — muted text, hover lightens slightly

---

## Mockup Reference

| File | Shows |
|------|-------|
| `organizer-dashboard.png` | Organizer dashboard + public attendee panel side-by-side |
| `attendee-qr-mobile.png`  | Mobile attendee app — QR check-in screen |

---

## What Needs Work Before Launch

1. **Logo mark** — the rounded-P needs custom design. Commission before mobile app.
2. **Nav typography weight** — active item needs bolder weight, currently flat.
3. **Venue Layout widget** — placeholder. Either build real floor plan or replace with expanded check-in feed.
4. **"Not Yet Arrived" stat card** — add amber card showing `registered - checked_in`.
