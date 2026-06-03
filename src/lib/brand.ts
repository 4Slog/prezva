/**
 * Prezva Brand Constants
 * Single source of truth for all brand values used in code.
 * UI tokens live in globals.css — this file is for JS/TS contexts.
 */

export const BRAND = {
  name: 'Prezva',
  tagline: 'Check in. Stand out.',
  url: 'https://prezva.app',
  supportEmail: 'support@prezva.app',
  helloEmail: 'hello@prezva.app',

  // Light canvas (redesign 2026-06). Dark "chrome" values (sidebars / kiosk) live in globals.css --pz-chrome-*.
  colors: {
    bg:         '#EDF1F6',
    surface:    '#FFFFFF',
    surface2:   '#F4F7FB',
    border:     '#E3E9F0',
    teal:       '#2DD4BF',
    tealLight:  '#00E5CC',
    tealDim:    '#007A6B',
    text:       '#0D1B2A',
    muted:      '#475A70',
    success:    '#047857',
    warning:    '#B45309',
    error:      '#DC2626',
    live:       '#E11D48',
  },

  typography: {
    fontSans: 'Geist',
    fontMono: 'Geist Mono',
    scale: {
      h1: '2rem / 700',
      h2: '1.5rem / 600',
      h3: '1.25rem / 600',
      body: '1rem / 400',
      small: '0.875rem / 400',
      label: '0.75rem / 500',
    },
  },

  radius: {
    card: '0.75rem',
    button: '0.5rem',
    badge: '9999px',
    avatar: '9999px',
  },
} as const

export type BrandColors = typeof BRAND.colors
