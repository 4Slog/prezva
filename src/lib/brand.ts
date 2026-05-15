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

  colors: {
    bg:         '#0D1B2A',
    surface:    '#112240',
    surface2:   '#1A2F4A',
    border:     '#1E3A5F',
    teal:       '#2DD4BF',
    tealLight:  '#00E5CC',
    tealDim:    '#007A6B',
    text:       '#F0F4F8',
    muted:      '#94A3B8',
    success:    '#22C55E',
    warning:    '#F59E0B',
    error:      '#EF4444',
    live:       '#F43F5E',
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
