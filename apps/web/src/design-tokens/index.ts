// Colors with inverse/default variants
import type { TagColor } from '@/types'

export const colors = {
  orange: {
    inverse: 'var(--color-orange-inverse)',
    default: 'var(--color-orange)',
  },
  green: {
    inverse: 'var(--color-green-inverse)',
    default: 'var(--color-green)',
  },
  teal: {
    inverse: 'var(--color-teal-inverse)',
    default: 'var(--color-teal)',
  },
  blue: {
    inverse: 'var(--color-blue-inverse)',
    default: 'var(--color-blue)',
  },
  indigo: {
    inverse: 'var(--color-indigo-inverse)',
    default: 'var(--color-indigo)',
  },
  purple: {
    inverse: 'var(--color-purple-inverse)',
    default: 'var(--color-purple)',
  },
  pink: {
    inverse: 'var(--color-pink-inverse)',
    default: 'var(--color-pink)',
  },
  brown: {
    inverse: 'var(--color-brown-inverse)',
    default: 'var(--color-brown)',
  },
  cyan: {
    inverse: 'var(--color-cyan-inverse)',
    default: 'var(--color-cyan)',
  },
  rose: {
    inverse: 'var(--color-rose-inverse)',
    default: 'var(--color-rose)',
  },
} as const

export type ColorName = TagColor
export type ColorVariant = 'inverse' | 'default'

// Shadows
export const shadows = {
  sm: 'var(--shadow-sm)',
  md: 'var(--shadow-md)',
  lg: 'var(--shadow-lg)',
} as const

// Borders
export const borders = {
  default: 'var(--border-default)',
  thick: 'var(--border-thick)',
} as const

// Status colors
export const statusColors = {
  ok: 'var(--color-status-ok)',
  warning: 'var(--color-status-warning)',
  error: 'var(--color-status-error)',
  inactive: 'var(--color-status-inactive)',
} as const

// Inventory states
export const inventoryStates = {
  lowStock: 'var(--color-inventory-low-stock)',
  expiring: 'var(--color-inventory-expiring)',
  inStock: 'var(--color-inventory-in-stock)',
  outOfStock: 'var(--color-inventory-out-of-stock)',
} as const

// Background layers (CSS variable names for programmatic use)
export const backgroundLayers = {
  base: 'var(--background-base)',
  surface: 'var(--background-surface)',
  elevated: 'var(--background-elevated)',
} as const

export type BackgroundLayer = keyof typeof backgroundLayers
