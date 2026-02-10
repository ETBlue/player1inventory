// Colors with tint/default variants
export const colors = {
  red: {
    tint: 'var(--color-red-tint)',
    default: 'var(--color-red)',
  },
  orange: {
    tint: 'var(--color-orange-tint)',
    default: 'var(--color-orange)',
  },
  amber: {
    tint: 'var(--color-amber-tint)',
    default: 'var(--color-amber)',
  },
  yellow: {
    tint: 'var(--color-yellow-tint)',
    default: 'var(--color-yellow)',
  },
  green: {
    tint: 'var(--color-green-tint)',
    default: 'var(--color-green)',
  },
  teal: {
    tint: 'var(--color-teal-tint)',
    default: 'var(--color-teal)',
  },
  blue: {
    tint: 'var(--color-blue-tint)',
    default: 'var(--color-blue)',
  },
  indigo: {
    tint: 'var(--color-indigo-tint)',
    default: 'var(--color-indigo)',
  },
  purple: {
    tint: 'var(--color-purple-tint)',
    default: 'var(--color-purple)',
  },
  pink: {
    tint: 'var(--color-pink-tint)',
    default: 'var(--color-pink)',
  },
} as const

export type ColorName = keyof typeof colors
export type ColorVariant = 'tint' | 'default'

// Generic color utilities
export const colorUtils = {
  tint: 'var(--color-tint)',
  dark: 'var(--color-dark)',
} as const

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
