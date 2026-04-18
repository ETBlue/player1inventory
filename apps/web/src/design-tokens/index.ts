// Colors with inverse/default variants
import type { TagColor } from '@/types'

export const colors = {
  orange: {
    inverse: 'var(--color-tag-orange-inverse)',
    default: 'var(--color-tag-orange)',
  },
  green: {
    inverse: 'var(--color-tag-green-inverse)',
    default: 'var(--color-tag-green)',
  },
  teal: {
    inverse: 'var(--color-tag-teal-inverse)',
    default: 'var(--color-tag-teal)',
  },
  blue: {
    inverse: 'var(--color-tag-blue-inverse)',
    default: 'var(--color-tag-blue)',
  },
  indigo: {
    inverse: 'var(--color-tag-indigo-inverse)',
    default: 'var(--color-tag-indigo)',
  },
  purple: {
    inverse: 'var(--color-tag-purple-inverse)',
    default: 'var(--color-tag-purple)',
  },
  pink: {
    inverse: 'var(--color-tag-pink-inverse)',
    default: 'var(--color-tag-pink)',
  },
  brown: {
    inverse: 'var(--color-tag-brown-inverse)',
    default: 'var(--color-tag-brown)',
  },
  cyan: {
    inverse: 'var(--color-tag-cyan-inverse)',
    default: 'var(--color-tag-cyan)',
  },
  rose: {
    inverse: 'var(--color-tag-rose-inverse)',
    default: 'var(--color-tag-rose)',
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
