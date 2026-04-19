// Colors with inverse/default variants
import type { TagColor } from '@/types'

export const colors = {
  orange: {
    inverse: 'var(--color-tag-orange-background-inverse)',
    default: 'var(--color-tag-orange-background)',
  },
  green: {
    inverse: 'var(--color-tag-green-background-inverse)',
    default: 'var(--color-tag-green-background)',
  },
  teal: {
    inverse: 'var(--color-tag-teal-background-inverse)',
    default: 'var(--color-tag-teal-background)',
  },
  blue: {
    inverse: 'var(--color-tag-blue-background-inverse)',
    default: 'var(--color-tag-blue-background)',
  },
  indigo: {
    inverse: 'var(--color-tag-indigo-background-inverse)',
    default: 'var(--color-tag-indigo-background)',
  },
  purple: {
    inverse: 'var(--color-tag-purple-background-inverse)',
    default: 'var(--color-tag-purple-background)',
  },
  pink: {
    inverse: 'var(--color-tag-pink-background-inverse)',
    default: 'var(--color-tag-pink-background)',
  },
  brown: {
    inverse: 'var(--color-tag-brown-background-inverse)',
    default: 'var(--color-tag-brown-background)',
  },
  cyan: {
    inverse: 'var(--color-tag-cyan-background-inverse)',
    default: 'var(--color-tag-cyan-background)',
  },
  rose: {
    inverse: 'var(--color-tag-rose-background-inverse)',
    default: 'var(--color-tag-rose-background)',
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
  ok: 'var(--color-status-ok-background)',
  warning: 'var(--color-status-warning-background)',
  error: 'var(--color-status-error-background)',
  inactive: 'var(--color-status-inactive-background)',
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
